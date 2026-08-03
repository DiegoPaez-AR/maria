// wa-hook.js — Canal WhatsApp v2 vía AutoResponder (2026-08-02, plan post-bloqueos)
//
// El teléfono dedicado corre WhatsApp oficial + AutoResponder PRO. Cada
// mensaje entrante dispara un POST acá (via nginx → internal-api
// /wa-hook/<WA_HOOK_SECRET>) con { query: { sender, message, isGroup, ... } }
// y la respuesta HTTP { replies: [{message}] } es lo que la app manda al chat.
//
// Diseño v1 (acordado con Diego):
//   - REPLY-ONLY por naturaleza: Maria nunca inicia por WA (email-first).
//   - sender = como aparece en la notificación de Android. El teléfono NO
//     tiene contactos guardados → llega el NÚMERO. Match → usuario
//     (resolverPorWa, banca variante 9-AR) o contacto de libreta (tercero).
//   - Deadline: si el turno tarda más que WA_HOOK_DEADLINE_MS, devolvemos
//     replies vacío y la respuesta va por TG/email (usuarios) o queda
//     stasheada para el próximo mensaje del remitente (24h TTL).
//   - Media: la notificación solo trae placeholder ("🎤 Mensaje de voz") →
//     hint al LLM para que redirija a texto/Telegram.
//   - Grupos: fuera (replies vacío), igual que siempre.
//   - Desconocidos (ni usuario ni libreta): SILENCIO + evento para revisión
//     (SCOPE: Maria no chatea con cualquiera; anti-spam).
//   - Serializado por remitente (cola por sender, sin solapes).

const mem = require('./memory');
const usuarios = require('./usuarios');
const seguridad = require('./seguridad');
const turnState = require('./turn-state');
const moderacion = require('./moderacion');
const waSend = require('./wa-send');
const { construirPrompt } = require('./prompt-builder');
const { invocarClaudeJSONConConsultas } = require('./claude-client');

const DEADLINE_MS = Number(process.env.WA_HOOK_DEADLINE_MS || 18_000);
const STASH_TTL_MS = 24 * 3600 * 1000;

// ── Media placeholders (es/en, WA cambia los textos cada tanto) ────────────
const RE_AUDIO = /🎤|mensaje de voz|voice message|audio \(\d|ptt/i;
const RE_FOTO  = /📷|📸|^foto$|^photo$|imagen/i;
const RE_VIDEO = /🎥|^video$|^vídeo$/i;
const RE_DOC   = /📄|documento|\.pdf|\.docx?|\.xlsx?/i;

function _hintMedia(texto) {
  const t = String(texto || '').trim();
  if (RE_AUDIO.test(t)) return '(el remitente mandó un AUDIO que no podés escuchar por este canal — pedile que te lo mande en texto, o por Telegram si es usuario vinculado)';
  if (RE_FOTO.test(t) && t.length < 25) return '(el remitente mandó una FOTO que no podés ver por este canal — pedile que te cuente qué es, o que la mande por Telegram si es usuario vinculado)';
  if (RE_VIDEO.test(t) && t.length < 25) return '(el remitente mandó un VIDEO que no podés ver por este canal)';
  if (RE_DOC.test(t) && t.length < 40) return `(el remitente mandó un ARCHIVO que no podés abrir por este canal: "${t}" — pedile que te lo mande por email si lo necesitás)`;
  return null;
}

// ── Identidad del remitente ────────────────────────────────────────────────
function _digitos(s) { return String(s || '').replace(/\D/g, ''); }

function _variantes(digs) {
  const v = new Set([digs]);
  if (digs.startsWith('549')) v.add('54' + digs.slice(3));
  else if (digs.startsWith('54')) v.add('549' + digs.slice(2));
  return [...v];
}

function _matchUsuario(digs) {
  if (!digs) return null;
  const vs = _variantes(digs);
  return usuarios.listarActivos().find(u => {
    const ud = _digitos(u.wa_cus);
    return ud && vs.includes(ud);
  }) || null;
}

function _matchLibreta(digs) {
  if (!digs) return [];
  const vs = _variantes(digs);
  const marcas = vs.map(() => "replace(replace(replace(COALESCE(whatsapp,''),'+',''),'-',''),' ','') LIKE '%' || ? ").join(' OR ');
  // match por sufijo (la libreta guarda formatos variados)
  const rows = mem.db.prepare(
    `SELECT usuario_id, nombre, whatsapp FROM contactos WHERE whatsapp IS NOT NULL AND (${marcas})`
  ).all(...vs);
  // dedupe por usuario
  const porUsuario = new Map();
  for (const r of rows) if (!porUsuario.has(r.usuario_id)) porUsuario.set(r.usuario_id, r);
  return [...porUsuario.values()];
}

// ── Stash de respuestas que no llegaron al deadline ────────────────────────
const _stash = new Map(); // digs -> { ts, replies: [] }
function _stashGuardar(digs, textos) {
  _stash.set(digs, { ts: Date.now(), replies: textos });
}
function _stashSacar(digs) {
  const e = _stash.get(digs);
  if (!e) return [];
  _stash.delete(digs);
  if (Date.now() - e.ts > STASH_TTL_MS) return [];
  return e.replies;
}

// ── Serialización por remitente ────────────────────────────────────────────
const _enProceso = new Map(); // digs -> Promise

// ── Turno de usuario ───────────────────────────────────────────────────────
async function _turnoUsuario(u, cuerpo) {
  const startTs = Date.now();
  const de = u.wa_cus || u.wa_lid || `agenda:${String(u.nombre).toLowerCase().replace(/\s+/g, '_')}`;
  const chatKey = 'wahook:' + de;
  turnState.setLastInbound(chatKey, startTs);

  const rl = seguridad.verificarRateLimit({ usuarioId: u.id });
  if (!rl.ok) return [`⏳ vas muy rápido — esperá ${Math.ceil(rl.retry_in_ms / 1000)}s`];
  const inj = seguridad.detectarInjection(cuerpo);
  if (inj) mem.logSecurityEvent({ usuarioId: u.id, canal: 'whatsapp', motivo: `injection_attempt: ${inj}`, body: cuerpo, extra: { via: 'autoresponder' } });

  mem.log({ usuarioId: u.id, canal: 'whatsapp', direccion: 'entrante', de, nombre: u.nombre, cuerpo, metadata: { via: 'autoresponder' } });

  const entrada = { de, nombre: u.nombre, cuerpo };
  const prompt = await construirPrompt({ usuario: u, canal: 'whatsapp', entrada });
  const { json } = await invocarClaudeJSONConConsultas(prompt, { usuario: u }, {
    audit: { usuarioId: u.id, canal: 'whatsapp', chatKey, turnStartTs: startTs, turnoTercero: false },
    sesion: 'off',
  });

  let respuesta = [json?.respuesta_a_usuario, json?.respuesta_a_remitente, (!json?.respuesta_a_usuario && !json?.respuesta_a_remitente) ? json?.respuesta : '']
    .filter(s => s && String(s).trim()).join('\n\n');

  const resTurno = turnState.takeTurnResults(chatKey, startTs);
  const fallas = resTurno.filter(r => !r.ok && !r.stale);
  if (fallas.length) {
    const detalle = fallas.map(r => r.accion?.tipo || '?').join(', ');
    respuesta = (respuesta ? respuesta + '\n\n' : '') + `⚠️ Ojo: no pude completar ${fallas.length === 1 ? 'esta acción' : 'estas acciones'}: ${detalle}.`;
  }

  if (respuesta && respuesta.trim()) {
    mem.log({ usuarioId: u.id, canal: 'whatsapp', direccion: 'saliente', de, nombre: u.nombre, cuerpo: respuesta, metadata: { via: 'autoresponder' } });
    return [respuesta];
  }
  return [];
}

// ── Turno de tercero (match único en libreta) ──────────────────────────────
async function _turnoTercero(u, contacto, de, cuerpo) {
  const startTs = Date.now();
  const chatKey = 'wahook:' + de;
  turnState.setLastInbound(chatKey, startTs);

  const rl = seguridad.verificarRateLimit({ usuarioId: u.id });
  if (!rl.ok) return [];

  mem.log({ usuarioId: u.id, canal: 'whatsapp', direccion: 'entrante', de, nombre: contacto.nombre, cuerpo, metadata: { via: 'autoresponder', tipo: 'tercero_libreta' } });

  const entrada = { de, nombre: contacto.nombre, cuerpo,
    contextoRemitente: { esTercero: true, via: 'libreta', razon: `"${contacto.nombre}" está en la libreta de ${u.nombre}` } };
  const prompt = await construirPrompt({ usuario: u, canal: 'whatsapp', entrada });
  const { json } = await invocarClaudeJSONConConsultas(prompt, { usuario: u }, {
    audit: { usuarioId: u.id, canal: 'whatsapp', chatKey, turnStartTs: startTs, turnoTercero: true },
    sesion: 'off',
  });

  const alTercero = (json?.respuesta_a_remitente || '').trim();
  const alUsuario = (json?.respuesta_a_usuario || '').trim();

  if (alUsuario) {
    try { await waSend.enviarWAUsuario(null, u, alUsuario, { tag: `wa-hook/3ro→${u.nombre}` }); }
    catch (e) { console.warn(`[wa-hook] aviso a ${u.nombre} falló:`, e.message); }
  }
  if (alTercero) {
    // Moderación saliente a tercero (mismo criterio fail-open que el handler viejo)
    try {
      const rm = await moderacion.revisarSaliente(alTercero);
      if (rm.bloquear) {
        mem.logSecurityEvent({ usuarioId: u.id, canal: 'whatsapp', motivo: `wa-hook respuesta a tercero bloqueada (${rm.categoria}/${rm.severidad})`, body: alTercero, extra: { destino: de } });
        return [];
      }
    } catch {}
    mem.log({ usuarioId: u.id, canal: 'whatsapp', direccion: 'saliente', de, nombre: contacto.nombre, cuerpo: alTercero, metadata: { via: 'autoresponder', tipo: 'tercero_libreta' } });
    return [alTercero];
  }
  return [];
}

// ── Entrada principal ──────────────────────────────────────────────────────
async function procesar(body) {
  const q = body && body.query;
  if (!q || typeof q.message !== 'string' || !q.sender) return { replies: [] };
  if (q.isTestMessage) return { replies: [{ message: '✅ Webhook de Maria conectado. Todo listo.' }] };
  if (q.isGroup) return { replies: [] };

  const hint = _hintMedia(q.message);
  const cuerpo = hint || q.message;

  // Identidad del remitente: NÚMERO (contacto no guardado en el teléfono) o
  // NOMBRE exacto (2026-08-02: Diego mantiene su agenda sincronizada en el
  // teléfono — esa agenda es de confianza porque la maneja él; el nombre lo
  // resuelve Android a partir del número real, no lo elige el remitente).
  const digs = _digitos(q.sender);
  const esNumero = digs && digs.length >= 8;
  let u = null;
  let tercero = null; // { usuario, contacto, de }

  if (esNumero) {
    u = _matchUsuario(digs);
    if (!u) {
      const ms = _matchLibreta(digs);
      if (ms.length === 1) {
        const due = usuarios.obtener(ms[0].usuario_id);
        if (due) tercero = { usuario: due, contacto: ms[0], de: `${digs}@c.us` };
      } else if (ms.length > 1) {
        mem.log({ canal: 'sistema', direccion: 'interno', cuerpo: `wa-hook: +${digs} matchea ${ms.length} libretas — no ruteo (candado homónimos)`, metadata: { tipo: 'wa_hook_ambiguo' } });
        return { replies: [] };
      }
    }
  } else {
    const n = String(q.sender).trim().toLowerCase();
    const us = usuarios.listarActivos().filter(x => String(x.nombre || '').trim().toLowerCase() === n);
    if (us.length === 1) {
      u = us[0];
    } else if (us.length > 1) {
      mem.log({ canal: 'sistema', direccion: 'interno', cuerpo: `wa-hook: nombre "${q.sender}" matchea ${us.length} usuarios — no ruteo`, metadata: { tipo: 'wa_hook_ambiguo' } });
      return { replies: [] };
    } else {
      const rows = mem.db.prepare(`SELECT usuario_id, nombre, whatsapp FROM contactos WHERE lower(trim(nombre)) = ?`).all(n);
      const porU = new Map();
      for (const r of rows) if (!porU.has(r.usuario_id)) porU.set(r.usuario_id, r);
      if (porU.size === 1) {
        const c = [...porU.values()][0];
        const due = usuarios.obtener(c.usuario_id);
        const deT = c.whatsapp ? `${_digitos(c.whatsapp)}@c.us` : `agenda:${n.replace(/\s+/g, '_')}`;
        if (due) tercero = { usuario: due, contacto: c, de: deT };
      } else if (porU.size > 1) {
        mem.log({ canal: 'sistema', direccion: 'interno', cuerpo: `wa-hook: nombre "${q.sender}" en ${porU.size} libretas — no ruteo (candado homónimos)`, metadata: { tipo: 'wa_hook_ambiguo' } });
        return { replies: [] };
      }
    }
  }

  if (!u && !tercero) {
    mem.log({ canal: 'sistema', direccion: 'interno', cuerpo: `wa-hook: desconocido ${esNumero ? '+' + digs : `"${String(q.sender).slice(0, 40)}"`}: "${String(q.message).slice(0, 80)}"`, metadata: { tipo: 'wa_hook_desconocido' } });
    return { replies: [] };
  }

  const clave = esNumero ? digs : 'n:' + String(q.sender).trim().toLowerCase();

  // Serializar por remitente
  const prev = _enProceso.get(clave) || Promise.resolve();
  const turno = prev.catch(() => {}).then(() => u ? _turnoUsuario(u, cuerpo) : _turnoTercero(tercero.usuario, tercero.contacto, tercero.de, cuerpo));
  _enProceso.set(clave, turno);
  turno.finally(() => { if (_enProceso.get(clave) === turno) _enProceso.delete(clave); });

  // Deadline: respondemos lo que llegue a tiempo; el resto va por TG/email o stash
  const timeout = new Promise(r => setTimeout(() => r(Symbol.for('deadline')), DEADLINE_MS));
  const resultado = await Promise.race([turno, timeout]);

  const pendientes = _stashSacar(clave);

  if (resultado !== Symbol.for('deadline')) {
    return { replies: [...pendientes, ...(resultado || [])].map(m => ({ message: m })) };
  }

  turno.then(async (textos) => {
    if (!textos || !textos.length) return;
    if (u && (u.telegram_chat_id || u.email)) {
      try {
        await waSend.enviarWAUsuario(null, u, textos.join('\n\n'), { tag: 'wa-hook/deadline' });
        console.log(`[wa-hook] deadline: respuesta a ${u.nombre} salió por TG/email`);
        return;
      } catch {}
    }
    _stashGuardar(clave, textos);
    console.log(`[wa-hook] deadline: respuesta a ${clave} stasheada para su próximo mensaje`);
  }).catch(e => console.error('[wa-hook] turno falló post-deadline:', e.message));

  return { replies: pendientes.map(m => ({ message: m })) };
}

module.exports = { procesar };
