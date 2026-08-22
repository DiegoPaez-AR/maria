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

const fs = require('fs');
const path = require('path');
const mem = require('./memory');
const usuarios = require('./usuarios');
const seguridad = require('./seguridad');
const turnState = require('./turn-state');
const moderacion = require('./moderacion');
const waSend = require('./wa-send');
const { construirPrompt } = require('./prompt-builder');
const { invocarClaudeJSONConConsultas } = require('./claude-client');
const gestionAjena = require('./gestion-ajena');

const DEADLINE_MS = Number(process.env.WA_HOOK_DEADLINE_MS || 18_000);
const STASH_TTL_MS = 24 * 3600 * 1000;

// ── Media placeholders (es/en, WA cambia los textos cada tanto) ────────────
const RE_AUDIO = /🎤|mensaje de voz|voice message|audio \(\d|ptt/i;
const RE_FOTO  = /📷|📸|^foto$|^photo$|imagen/i;
const RE_VIDEO = /🎥|^video$|^vídeo$/i;
const RE_DOC   = /📄|documento|\.pdf|\.docx?|\.xlsx?/i;

// rol: 'usuario_vinculado' (tiene Telegram) | 'usuario_sin_tg' | 'tercero' | 'neutral'
// (2026-08-16, pedido Diego: a TERCEROS pedirles TEXTO amablemente — no
// ofrecerles Telegram, que es para usuarios; a usuarios sin TG, aprovechar
// para invitarlos a vincularse.)
function _hintMedia(texto, rol = 'neutral') {
  const t = String(texto || '').trim();
  const esAudio = RE_AUDIO.test(t);
  const esFoto = RE_FOTO.test(t) && t.length < 25;
  const esVideo = RE_VIDEO.test(t) && t.length < 25;
  const esDoc = RE_DOC.test(t) && t.length < 40;
  if (!esAudio && !esFoto && !esVideo && !esDoc) return null;
  const que = esAudio ? 'un AUDIO que no podés escuchar' : esFoto ? 'una FOTO que no podés ver' : esVideo ? 'un VIDEO que no podés ver' : `un ARCHIVO que no podés abrir ("${t}")`;
  if (rol === 'tercero') {
    return `(el remitente mandó ${que} por este canal — decile amablemente que por acá no ${esAudio ? 'podés escuchar audios' : 'podés verlo'} y pedile que te lo mande en texto${esDoc ? ' o por email' : ''})`;
  }
  if (rol === 'usuario_vinculado') {
    return `(${usuarioMandó(que)} — pedile que te lo mande por TELEGRAM, que ahí sí ${esAudio ? 'lo escuchás' : 'lo ves'} (ya está vinculado), o que te lo escriba en texto)`;
  }
  if (rol === 'usuario_sin_tg') {
    return `(${usuarioMandó(que)} — pedile que te lo mande en texto, y aprovechá para contarle que por Telegram sí ${esAudio ? 'escuchás audios' : 'ves archivos y fotos'}: vincularse toma 1 minuto en t.me/${process.env.TELEGRAM_BOT_USERNAME || 'MariaPaezAI_bot'} tocando "compartir mi número")`;
  }
  return `(el remitente mandó ${que} por este canal — pedile que te lo mande en texto)`;
}
function usuarioMandó(que) { return `el usuario mandó ${que} por WhatsApp`; }

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
  // OJO: whatsapp se guarda como '549...@c.us' → match por CONTAINS, no sufijo
  const marcas = vs.map(() => "replace(replace(replace(COALESCE(whatsapp,''),'+',''),'-',''),' ','') LIKE '%' || ? || '%' ").join(' OR ');
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
async function _turnoUsuario(u, cuerpo, attachmentPath = null) {
  const startTs = Date.now();
  const de = u.wa_cus || u.wa_lid || `agenda:${String(u.nombre).toLowerCase().replace(/\s+/g, '_')}`;
  const chatKey = 'wahook:' + de;
  turnState.setLastInbound(chatKey, startTs);

  const rl = seguridad.verificarRateLimit({ usuarioId: u.id });
  if (!rl.ok) return [`⏳ vas muy rápido — esperá ${Math.ceil(rl.retry_in_ms / 1000)}s`];
  const inj = seguridad.detectarInjection(cuerpo);
  if (inj) mem.logSecurityEvent({ usuarioId: u.id, canal: 'whatsapp', motivo: `injection_attempt: ${inj}`, body: cuerpo, extra: { via: 'autoresponder' } });

  mem.log({ usuarioId: u.id, canal: 'whatsapp', direccion: 'entrante', de, nombre: u.nombre, cuerpo, metadata: { via: 'autoresponder' } });

  const entrada = { de, nombre: u.nombre, cuerpo, ...(attachmentPath ? { attachmentPath } : {}) };
  const prompt = await construirPrompt({ usuario: u, canal: 'whatsapp', entrada });
  const { json } = await invocarClaudeJSONConConsultas(prompt, { usuario: u }, {
    audit: { usuarioId: u.id, canal: 'whatsapp', chatKey, turnStartTs: startTs, turnoTercero: false },
    sesion: 'off',
  });

  let respuesta = [json?.respuesta_a_usuario, json?.respuesta_a_remitente, (!json?.respuesta_a_usuario && !json?.respuesta_a_remitente) ? json?.respuesta : '']
    .filter(s => s && String(s).trim()).join('\n\n');

  const resTurno = turnState.takeTurnResults(chatKey, startTs);
  // No avisar una falla si una acción del MISMO tipo salió OK después en el
  // turno (caso saludo Santiago 17/8: enviar_wa falló con "PLACEHOLDER", el
  // LLM se auto-corrigió y salió — pero el aviso confundía igual).
  const _okTipos = new Set(resTurno.filter(r => r.ok).map(r => r.accion?.tipo));
  const fallas = resTurno.filter(r => !r.ok && !r.stale && !_okTipos.has(r.accion?.tipo));
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
async function _turnoTercero(u, contacto, de, cuerpo, attachmentPath = null) {
  const startTs = Date.now();
  const chatKey = 'wahook:' + de;
  turnState.setLastInbound(chatKey, startTs);

  const rl = seguridad.verificarRateLimit({ usuarioId: u.id });
  if (!rl.ok) return [];

  mem.log({ usuarioId: u.id, canal: 'whatsapp', direccion: 'entrante', de, nombre: contacto.nombre, cuerpo, metadata: { via: 'autoresponder', tipo: 'tercero_libreta' } });

  const entrada = { de, nombre: contacto.nombre, cuerpo, ...(attachmentPath ? { attachmentPath } : {}),
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
// Latido del teléfono: TODO request (incluso vacío o de test) actualiza el
// marker. El watchdog avisa si pasa demasiado tiempo sin señal — el canal WA
// v2 no tiene heartbeat propio y un silencio puede ser "nadie escribió" o
// "AutoResponder muerto" (ambiguo, incidente 9-14/08).
const LATIDO_F = path.join(path.dirname(path.dirname(process.env.MARIA_DB || './db/x')), 'wa-hook-latido');
function latir() {
  try { fs.writeFileSync(LATIDO_F, String(Date.now())); } catch {}
}
function ultimoLatido() {
  try { return Number(fs.readFileSync(LATIDO_F, 'utf8').trim()) || 0; } catch { return 0; }
}

// Adaptador WA del ruteo por identidad (gestion-ajena.js): si el módulo
// dice que el mensaje responde una gestión ajena, armamos el shape de tercero
// con el contacto de la libreta del dueño (o fallback mínimo).
async function _gestionAjenaRelacionada(u, digsU, cuerpo) {
  const r = await gestionAjena.gestionAjenaRelacionada(u, cuerpo, { canal: 'whatsapp' });
  if (!r) return null;
  const c = _matchLibreta(digsU).find(x => x.usuario_id === r.due.id)
    || { usuario_id: r.due.id, nombre: u.nombre, whatsapp: `${digsU}@c.us` };
  return { usuario: r.due, contacto: c, de: `${digsU}@c.us` };
}

async function procesar(body) {
  latir();
  const q = body && body.query;
  if (!q || typeof q.message !== 'string' || !q.sender) return { replies: [] };
  if (q.isTestMessage) return { replies: [{ message: '✅ Webhook de Maria conectado. Todo listo.' }] };
  // Medición del timeout real de AutoResponder (2026-08-04): "!lentoN"
  // espera N segundos y responde — si la respuesta llega al chat, la app
  // banca N segundos. Para calibrar WA_HOOK_DEADLINE_MS con datos.
  const _lento = String(q.message).trim().match(/^!lento(\d{1,3})$/i);
  if (_lento) {
    const seg = Math.min(Number(_lento[1]), 120);
    await new Promise(r => setTimeout(r, seg * 1000));
    return { replies: [{ message: `ok — respondí a los ${seg}s` }] };
  }
  if (q.isGroup) return { replies: [] };

  // Placeholder de WA cuando la notificación llega antes del descifrado:
  // no hay contenido real todavía — ignorar (el mensaje descifrado suele
  // disparar otra notificación después).
  if (/waiting for this message|esperando este mensaje/i.test(q.message)) return { replies: [] };

  const hint = _hintMedia(q.message);
  let cuerpo = hint || q.message;

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
        // ¿El número del contacto es de un USUARIO? Entonces es el usuario
        // escribiendo (su nombre de agenda no coincide con el de la DB —
        // caso "Diego Paez" vs usuario "Diego", E2E 2/8). Resolver por
        // número SIEMPRE le gana al ruteo como tercero.
        const digsC = _digitos(c.whatsapp || '');
        const uPorNumero = digsC.length >= 8 ? _matchUsuario(digsC) : null;
        if (uPorNumero) {
          u = uPorNumero;
        } else {
          const due = usuarios.obtener(c.usuario_id);
          const deT = c.whatsapp ? `${_digitos(c.whatsapp)}@c.us` : `agenda:${n.replace(/\s+/g, '_')}`;
          if (due) tercero = { usuario: due, contacto: c, de: deT };
        }
      } else if (porU.size > 1) {
        mem.log({ canal: 'sistema', direccion: 'interno', cuerpo: `wa-hook: nombre "${q.sender}" en ${porU.size} libretas — no ruteo (candado homónimos)`, metadata: { tipo: 'wa_hook_ambiguo' } });
        return { replies: [] };
      }
    }
  }

  // ── Gap usuario-como-tercero (2026-08-16, diseño Diego, caso Fulco 14/8):
  // si quien escribe ES usuario pero hay gestiones ABIERTAS de OTROS usuarios
  // esperando su respuesta (esperando_de), un clasificador barato decide si
  // este mensaje LAS responde. Relacionado → turno de TERCERO del dueño de la
  // gestión. No relacionado / duda / error → turno propio (fail-open).
  if (u) {
    try {
      const digsU = esNumero ? digs : _digitos(u.wa_cus || '');
      const ajena = digsU && digsU.length >= 8 ? await _gestionAjenaRelacionada(u, digsU, cuerpo) : null;
      if (ajena) { tercero = ajena; u = null; }
    } catch (err) {
      console.warn(`[wa-hook] chequeo gestión ajena falló (sigo como usuario): ${err.message}`);
    }
  }

  // Afinar el hint de media según el ROL del remitente (lo sabemos recién acá)
  if (hint) {
    const rol = u ? (u.telegram_chat_id ? 'usuario_vinculado' : 'usuario_sin_tg') : (tercero ? 'tercero' : 'neutral');
    cuerpo = _hintMedia(q.message, rol) || cuerpo;
  }

  if (!u && !tercero) {
    mem.log({ canal: 'sistema', direccion: 'interno', cuerpo: `wa-hook: desconocido ${esNumero ? '+' + digs : `"${String(q.sender).slice(0, 40)}"`}: "${String(q.message).slice(0, 80)}"`, metadata: { tipo: 'wa_hook_desconocido' } });
    return { replies: [] };
  }

  // ⚠️ POLÍTICA v5 (2026-08-22, decisión Diego): los USUARIOS no se atienden por
  // WhatsApp. Si escribe un usuario (y NO es respuesta a una gestión ajena, que
  // ya se resolvió arriba), respondemos una NEGATIVA FIJA y no corremos turno:
  // ni LLM ni acciones. Los terceros sí se atienden normal.
  if (u && !tercero) {
    const bot = process.env.TELEGRAM_BOT_USERNAME ? String(process.env.TELEGRAM_BOT_USERNAME).replace(/^@/, '') : 'MariaPaezAI_bot';
    const primer = String(u.nombre || '').trim().split(/\s+/)[0] || '';
    const texto = `Hola ${primer}! Por política ahora no puedo atender pedidos por WhatsApp 🙏\n\nEscribime por *Telegram* (t.me/${bot} → tocá "compartir mi número") o por mail a ${process.env.ASISTENTE_FROM_EMAIL || 'maria.paez@intensa.io'} y sigo con lo tuyo al toque.`;
    mem.log({ usuarioId: u.id, canal: 'whatsapp', direccion: 'entrante', de: u.wa_cus || `${digs}@c.us`, nombre: u.nombre, cuerpo,
      metadata: { via: 'mariabridge', tipo: 'usuario_por_wa_derivado' } });
    mem.log({ usuarioId: u.id, canal: 'whatsapp', direccion: 'saliente', de: u.wa_cus || `${digs}@c.us`, nombre: u.nombre, cuerpo: texto,
      metadata: { via: 'mariabridge', tipo: 'derivacion_a_telegram' } });
    console.log(`[wa-hook] ${u.nombre} escribió por WA → derivado a Telegram/email (sin turno)`);
    return { replies: [{ message: texto }] };
  }

  const clave = esNumero ? digs : 'n:' + String(q.sender).trim().toLowerCase();

  // Serializar por remitente
  const prev = _enProceso.get(clave) || Promise.resolve();
  const turno = prev.catch(() => {}).then(() => u ? _turnoUsuario(u, cuerpo, q.attachmentPath || null) : _turnoTercero(tercero.usuario, tercero.contacto, tercero.de, cuerpo, q.attachmentPath || null));
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

module.exports = { procesar, latir, ultimoLatido };
