// wa-outbox.js — cola de mensajes que Maria INICIA por WhatsApp (2026-08-04).
//
// AutoResponder solo responde notificaciones: no puede iniciar chats. Para
// iniciar, el teléfono corre Tasker, que cada minuto pregunta a este VPS si
// hay algo pendiente; si hay, abre wa.me/<numero>?text=... y toca enviar.
// Todo sale por la app oficial de WhatsApp (mismo perfil que un humano).
//
// Endpoints (en internal-api, bajo /wa-hook/<secret>/...):
//   GET  .../pendiente        → { id, numero, texto } | {}
//   POST .../confirmar {id}   → marca enviado
//
// Salvaguardas: solo un mensaje por poll (goteo natural), TTL 6h (si el
// teléfono estuvo apagado no mandamos algo viejo), reintentos capeados.

const mem = require('./memory');

mem.db.exec(`CREATE TABLE IF NOT EXISTS wa_outbox (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  creado      DATETIME DEFAULT CURRENT_TIMESTAMP,
  usuario_id  INTEGER,
  numero      TEXT NOT NULL,          -- solo dígitos, formato internacional
  texto       TEXT NOT NULL,
  estado      TEXT NOT NULL DEFAULT 'pendiente',  -- pendiente|entregado|vencido
  intentos    INTEGER NOT NULL DEFAULT 0,
  tomado_en   DATETIME,
  entregado   DATETIME,
  metadata_json TEXT
)`);

const TTL_H = Number(process.env.WA_OUTBOX_TTL_H || 6);
const MAX_INTENTOS = Number(process.env.WA_OUTBOX_MAX_INTENTOS || 400);  // alto a propósito (2026-08-15): con MariaBridge un mensaje ESPERA a que el chat tenga notif viva; solo vence por TTL (6h). Con Tasker daba igual (confirma al 1er intento).

// ── Comportamiento humano (2026-08-22, pedido Diego tras 3 sanciones de Meta) ──
// Ventana horaria, jitter y cadencia entre chats: nada de ráfagas ni horarios
// exactos. Aplica a lo que Maria INICIA (esta cola); las respuestas a quien nos
// escribe van por RemoteInput y no pasan por acá.
const HORA_DESDE = Number(process.env.WA_VENTANA_DESDE || 8);
const HORA_HASTA = Number(process.env.WA_VENTANA_HASTA || 23);
const CADENCIA_MIN_MS = Number(process.env.WA_CADENCIA_MIN_MS || 3 * 60_000);
const CADENCIA_MAX_MS = Number(process.env.WA_CADENCIA_MAX_MS || 8 * 60_000);
const JITTER_MAX_MS = Number(process.env.WA_JITTER_MAX_MS || 240_000);
const TZ = process.env.ASISTENTE_TZ || 'America/Argentina/Buenos_Aires';

function _horaLocal() {
  try {
    return Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hour12: false }).format(new Date()));
  } catch { return new Date().getHours(); }
}
function _enVentana() {
  const h = _horaLocal();
  return h >= HORA_DESDE && h < HORA_HASTA;
}
try { mem.db.exec(`ALTER TABLE wa_outbox ADD COLUMN no_antes DATETIME`); } catch { /* ya existe */ }

function encolar({ usuarioId = null, numero, texto, metadata = null }) {
  // SWITCH MAESTRO (2026-08-18: cuenta EN REVISIÓN por 2ª vez — el loop de la
  // mañana): con WA_SALIENTE_OFF=1 NADA se encola; los callers caen a su
  // fallback (wa-send → TG/email; acciones → error honesto al usuario).
  // Reactivar: sacar la línea del .conf + reload.
  if (process.env.WA_SALIENTE_OFF === '1') {
    throw new Error('WA saliente APAGADO (cuenta en revisión) — va por Telegram/email');
  }
  const digs = String(numero || '').replace(/\D/g, '');
  if (!digs || digs.length < 8) throw new Error(`wa-outbox: número inválido "${numero}"`);
  if (!texto || !String(texto).trim()) throw new Error('wa-outbox: texto vacío');
  // Jitter: nada sale en el minuto exacto (los programados salían 10:00:00 en
  // punto = firma de bot). 30s a 4min de desfase aleatorio.
  const jitter = 30_000 + Math.floor(Math.random() * JITTER_MAX_MS);
  const noAntes = new Date(Date.now() + jitter).toISOString().replace('T', ' ').slice(0, 19);
  const r = mem.db.prepare(
    `INSERT INTO wa_outbox (usuario_id, numero, texto, metadata_json, no_antes) VALUES (?, ?, ?, ?, ?)`
  ).run(usuarioId, digs, String(texto), metadata ? JSON.stringify(metadata) : null, noAntes);
  console.log(`[wa-outbox] #${r.lastInsertRowid} encolado → +${digs} (${String(texto).slice(0, 40)}…)`);
  return r.lastInsertRowid;
}

// Vence lo viejo y devuelve UNO pendiente (el más antiguo vigente).
function siguiente() {
  // Vencimiento con RASTRO (auditoría 22/8 #9): antes moría en silencio y el
  // saliente ya figuraba como enviado en eventos → falsa confirmación.
  const _porVencer = mem.db.prepare(
    `SELECT id, usuario_id, numero, substr(texto,1,60) t FROM wa_outbox
      WHERE estado='pendiente' AND (creado <= datetime('now', ?) OR intentos >= ?)`
  ).all(`-${TTL_H} hours`, MAX_INTENTOS);
  mem.db.prepare(
    `UPDATE wa_outbox SET estado='vencido' WHERE estado='pendiente' AND (creado <= datetime('now', ?) OR intentos >= ?)`
  ).run(`-${TTL_H} hours`, MAX_INTENTOS);
  for (const v of _porVencer) {
    console.warn(`[wa-outbox] #${v.id} VENCIDO sin entregar → ${v.numero}: "${String(v.t).replace(/\n/g, ' ')}"`);
    try {
      mem.log({ usuarioId: v.usuario_id || null, canal: 'sistema', direccion: 'interno',
        cuerpo: `wa-outbox: mensaje #${v.id} a ${v.numero} VENCIÓ sin entregarse: "${String(v.t).replace(/\n/g, ' ')}"`,
        metadata: { tipo: 'wa_outbox_vencido', outboxId: v.id, numero: v.numero } });
    } catch { /* noop */ }
  }
  // Lease anti-duplicado (2026-08-16): no re-servir un mensaje ya entregado a un
  // poller en los últimos LEASE_S segundos. Evita el triple-envío por polls
  // concurrentes de MariaBridge (agarraban el mismo id antes de confirmar).
  const LEASE_S = Number(process.env.WA_OUTBOX_LEASE_S || 90);  // > pausa humana de la app (hasta 25s) — con 20s el mismo mensaje se servía dos veces (auditoría #5)
  // Ventana horaria: fuera de horario NO se sirve nada (queda en cola).
  if (!_enVentana()) return null;
  const row = mem.db.prepare(
    `SELECT * FROM wa_outbox WHERE estado='pendiente'
       AND (tomado_en IS NULL OR tomado_en <= datetime('now', ?))
       AND (no_antes IS NULL OR no_antes <= datetime('now'))
     ORDER BY id ASC LIMIT 1`
  ).get(`-${LEASE_S} seconds`);
  if (!row) return null;
  // Cadencia entre CHATS DISTINTOS: si el último servido fue a otro número hace
  // menos de 3-8 min (aleatorio), esperamos. Al MISMO chat no aplica
  // (conversación natural).
  try {
    const ult = mem.db.prepare(
      `SELECT numero, tomado_en FROM wa_outbox WHERE tomado_en IS NOT NULL ORDER BY tomado_en DESC LIMIT 1`
    ).get();
    if (ult && String(ult.numero) !== String(row.numero)) {
      const espera = CADENCIA_MIN_MS + Math.floor(Math.random() * (CADENCIA_MAX_MS - CADENCIA_MIN_MS));
      const desde = Date.parse(String(ult.tomado_en).replace(' ', 'T') + 'Z');
      if (Number.isFinite(desde) && Date.now() - desde < espera) return null;
    }
  } catch { /* noop */ }
  mem.db.prepare(`UPDATE wa_outbox SET intentos = intentos + 1, tomado_en = CURRENT_TIMESTAMP WHERE id = ?`).run(row.id);
  return { id: row.id, numero: _numeroEnvio(row.numero), texto: row.texto };
}

// Formato de ENVÍO para el teléfono (2026-08-15): los deep-links de WhatsApp
// exigen el formato móvil AR completo (549...). Números guardados sin el "9"
// (canónico viejo de wwebjs, ej. el wa_cus de Diego) fallaban en silencio:
// Tasker confirmaba pero el mensaje no llegaba. Solo transforma la SALIDA,
// lo guardado no se toca.
function _numeroEnvio(n) {
  // LID → número real (2026-08-16, preflight campaña): destinos '<id>@lid'
  // (identidad oculta de WhatsApp, válida en wwebjs) NO sirven para wa.me /
  // MariaBridge. Si el numero corresponde al wa_lid de un usuario, servimos
  // su wa_cus (número real). Lookup lazy para evitar ciclos de require.
  try {
    const raw = String(n || '');
    const digs = raw.replace(/\D/g, '');
    if (raw.includes('@lid') || digs.length > 13) {
      const usuarios = require('./usuarios');
      const u = usuarios.listarActivos().find(x => String(x.wa_lid || '').replace(/\D/g, '') === digs);
      if (u && u.wa_cus) n = u.wa_cus;
    }
  } catch (_) {}
  // Forma de envio canonica (telefonos.js): en Argentina WhatsApp necesita el
  // "9" de celular despues del 54; el resto del mundo va tal cual.
  return require('./telefonos').paraWa(n);
}

function confirmar(id) {
  const row = mem.db.prepare(`SELECT * FROM wa_outbox WHERE id = ?`).get(Number(id));
  if (!row) return false;
  mem.db.prepare(`UPDATE wa_outbox SET estado='entregado', entregado=CURRENT_TIMESTAMP WHERE id = ?`).run(row.id);
  try {
    mem.log({
      usuarioId: row.usuario_id, canal: 'whatsapp', direccion: 'saliente',
      de: `${row.numero}@c.us`, cuerpo: row.texto,
      metadata: { via: 'tasker_outbox', outboxId: row.id },
    });
  } catch {}
  console.log(`[wa-outbox] #${row.id} entregado por el teléfono`);
  return true;
}

// Confirma el último mensaje TOMADO que sigue pendiente. Pensado para el
// teléfono (Tasker), que es el único consumidor y procesa de a uno: así el
// cliente no necesita mandar el id (las variables de Tasker daban problemas).
function confirmarUltimo() {
  const row = mem.db.prepare(
    `SELECT * FROM wa_outbox WHERE estado='pendiente' AND tomado_en IS NOT NULL ORDER BY tomado_en DESC LIMIT 1`
  ).get();
  if (!row) return { ok: false, motivo: 'no hay pendientes tomados' };
  confirmar(row.id);
  return { ok: true, id: row.id };
}

// Fallo de COLD-send reportado por MariaBridge (2026-08-17, caso Carolina
// #46: número sin WhatsApp → 314 reintentos con la pantalla prendiéndose).
// motivo 'numero_sin_whatsapp' → vencido INMEDIATO; otros → contador en
// metadata_json, al 5º → vencido. Al vencer: aviso WA al owner con el email
// del contacto si está en alguna libreta (el owner decide si va por mail).
function registrarFalloCold(id, motivo) {
  const row = mem.db.prepare(`SELECT * FROM wa_outbox WHERE id = ?`).get(id);
  if (!row || row.estado !== 'pendiente') return { id, estado: row ? row.estado : 'inexistente' };
  let meta = {};
  try { meta = JSON.parse(row.metadata_json || '{}'); } catch {}
  const MAXF = Number(process.env.WA_OUTBOX_COLD_FALLOS_MAX || 5);
  meta.cold_fallos = (meta.cold_fallos || 0) + 1;
  meta.cold_motivo = String(motivo || 'desconocido').slice(0, 60);
  const definitivo = motivo === 'numero_sin_whatsapp' || meta.cold_fallos >= MAXF;
  mem.db.prepare(`UPDATE wa_outbox SET metadata_json = ?, estado = CASE WHEN ? THEN 'vencido' ELSE estado END WHERE id = ?`)
    .run(JSON.stringify(meta), definitivo ? 1 : 0, id);
  if (definitivo) {
    try { _avisarOwnerFalloEntrega(row, meta); } catch (e) { console.warn('[wa-outbox] aviso fallo entrega:', e.message); }
  }
  return { id, cold_fallos: meta.cold_fallos, definitivo };
}

function _avisarOwnerFalloEntrega(row, meta) {
  // ANTI-RECURSIÓN (18/8: los avisos de fallo fallaban y generaban avisos de
  // su propio fallo — 15 avisos-de-avisos en una mañana): un aviso que falla
  // NO genera otro aviso. Solo log.
  try {
    const m0 = JSON.parse(row.metadata_json || '{}');
    if (m0.tipo === 'aviso_fallo_entrega') {
      console.warn(`[wa-outbox] aviso #${row.id} tampoco se entregó — NO re-aviso (anti-recursión)`);
      return;
    }
  } catch { /* noop */ }
  const usuarios = require('./usuarios');
  const owner = usuarios.obtenerOwner();
  if (!owner || !owner.wa_cus) return;
  const tel = require('./telefonos');
  let c = null;
  for (const v of tel.variantes(row.numero)) {
    c = mem.db.prepare(
      `SELECT nombre, email FROM contactos WHERE replace(replace(replace(COALESCE(whatsapp,''),'@c.us',''),'+',''),' ','') = ? AND email IS NOT NULL LIMIT 1`
    ).get(v);
    if (c) break;
  }
  const quien = c ? c.nombre : row.numero;
  const motivoTxt = meta.cold_motivo === 'numero_sin_whatsapp'
    ? 'el número NO está en WhatsApp' : `no pude entregarlo tras ${meta.cold_fallos} intentos`;
  const sugerencia = c && c.email
    ? `Tiene email en la libreta (${c.email}) — decime si querés que se lo mande por mail.`
    : 'No tiene email en la libreta.';
  const texto = `⚠️ No pude entregar un WhatsApp a ${quien}: ${motivoTxt}. El mensaje decía: "${String(row.texto).slice(0, 80)}…". ${sugerencia}`;
  encolar({ usuarioId: owner.id, numero: String(owner.wa_cus).replace('@c.us', ''), texto, metadata: { tipo: 'aviso_fallo_entrega', outboxId: row.id } });
  mem.log({ usuarioId: row.usuario_id || null, canal: 'sistema', direccion: 'interno',
    cuerpo: `wa-outbox: entrega FALLIDA definitiva #${row.id} a ${row.numero} (${meta.cold_motivo}) — aviso al owner`,
    metadata: { tipo: 'fallo_entrega_wa', outboxId: row.id, motivo: meta.cold_motivo } });
}

module.exports = { encolar, siguiente, confirmar, confirmarUltimo, registrarFalloCold };
