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

function encolar({ usuarioId = null, numero, texto, metadata = null }) {
  const digs = String(numero || '').replace(/\D/g, '');
  if (!digs || digs.length < 8) throw new Error(`wa-outbox: número inválido "${numero}"`);
  if (!texto || !String(texto).trim()) throw new Error('wa-outbox: texto vacío');
  const r = mem.db.prepare(
    `INSERT INTO wa_outbox (usuario_id, numero, texto, metadata_json) VALUES (?, ?, ?, ?)`
  ).run(usuarioId, digs, String(texto), metadata ? JSON.stringify(metadata) : null);
  console.log(`[wa-outbox] #${r.lastInsertRowid} encolado → +${digs} (${String(texto).slice(0, 40)}…)`);
  return r.lastInsertRowid;
}

// Vence lo viejo y devuelve UNO pendiente (el más antiguo vigente).
function siguiente() {
  mem.db.prepare(
    `UPDATE wa_outbox SET estado='vencido' WHERE estado='pendiente' AND (creado <= datetime('now', ?) OR intentos >= ?)`
  ).run(`-${TTL_H} hours`, MAX_INTENTOS);
  // Lease anti-duplicado (2026-08-16): no re-servir un mensaje ya entregado a un
  // poller en los últimos LEASE_S segundos. Evita el triple-envío por polls
  // concurrentes de MariaBridge (agarraban el mismo id antes de confirmar).
  const LEASE_S = Number(process.env.WA_OUTBOX_LEASE_S || 20);
  const row = mem.db.prepare(
    `SELECT * FROM wa_outbox WHERE estado='pendiente'
       AND (tomado_en IS NULL OR tomado_en <= datetime('now', ?))
     ORDER BY id ASC LIMIT 1`
  ).get(`-${LEASE_S} seconds`);
  if (!row) return null;
  mem.db.prepare(`UPDATE wa_outbox SET intentos = intentos + 1, tomado_en = CURRENT_TIMESTAMP WHERE id = ?`).run(row.id);
  return { id: row.id, numero: _numeroEnvio(row.numero), texto: row.texto };
}

// Formato de ENVÍO para el teléfono (2026-08-15): los deep-links de WhatsApp
// exigen el formato móvil AR completo (549...). Números guardados sin el "9"
// (canónico viejo de wwebjs, ej. el wa_cus de Diego) fallaban en silencio:
// Tasker confirmaba pero el mensaje no llegaba. Solo transforma la SALIDA,
// lo guardado no se toca.
function _numeroEnvio(n) {
  const d = String(n).replace(/\D/g, '');
  if (/^54\d{10}$/.test(d)) return '549' + d.slice(2);
  return d;
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

module.exports = { encolar, siguiente, confirmar, confirmarUltimo };
