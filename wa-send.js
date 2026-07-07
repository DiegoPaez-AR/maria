// wa-send.js — wrapper canónico para envíos de WhatsApp a un usuario o a
// un destino crudo. Centraliza la resolución de @c.us↔@lid, el catch+
// fallback que ya existía en executor._enviarWA, el log saliente en
// `eventos`, y la integración con el watchdog del cliente WA.
//
// Antes esta lógica vivía sólo en executor._enviarWA; los dispatchers
// (morning-brief, recordatorios, programados, etc.) hacían
// `client.sendMessage(usuario.wa_lid || usuario.wa_cus, texto)` crudo,
// sin fallback. Eso causó el spam de morning-brief de Doris durante 2
// días: su wa_cus estaba corrupto y morning-brief no podía recuperarse.

const mem = require('./memory');
const usuarios = require('./usuarios');
const silencio = require('./silencio');

// ── EMBUDO WA (2026-07-07, tras el 2do bloqueo de Meta) ────────────────────
// Cola FIFO global: entre un client.sendMessage y el siguiente pasan como
// mínimo WA_EMBUDO_MS (default 15s) + jitter aleatorio 0-WA_EMBUDO_JITTER_MS
// (default 5s), para que el intervalo no sea robóticamente exacto. La ráfaga
// post-desbloqueo (10 msgs en 3min) fue casi seguro lo que re-voló la cuenta.
// Se aplica ENVOLVIENDO client.sendMessage en crearClienteWA (un solo punto:
// nada puede saltearse el embudo, ni los callers directos del handler).
const EMBUDO_MS = Number(process.env.WA_EMBUDO_MS || 15_000);
const EMBUDO_JITTER_MS = Number(process.env.WA_EMBUDO_JITTER_MS || 5_000);
let _colaEmbudo = Promise.resolve();
let _ultimoEnvioWA = 0;

function embudoWA(fn) {
  const p = _colaEmbudo.then(async () => {
    const gap = EMBUDO_MS + Math.floor(Math.random() * Math.max(0, EMBUDO_JITTER_MS));
    const espera = Math.max(0, _ultimoEnvioWA + gap - Date.now());
    if (espera > 500) console.log(`[wa-embudo] espero ${Math.round(espera / 1000)}s (cola de envíos)`);
    if (espera > 0) await new Promise(r => setTimeout(r, espera));
    try { return await fn(); } finally { _ultimoEnvioWA = Date.now(); }
  });
  _colaEmbudo = p.then(() => {}, () => {}); // un fallo no rompe la cola
  return p;
}

/** Envuelve client.sendMessage con el embudo. Llamar UNA vez al crear el cliente. */
function aplicarEmbudo(client) {
  if (!client || client._embudoAplicado) return client;
  const orig = client.sendMessage.bind(client);
  client.sendMessage = (...args) => embudoWA(() => orig(...args));
  client._embudoAplicado = true;
  console.log(`[wa-embudo] activo: min ${EMBUDO_MS / 1000}s + jitter ${EMBUDO_JITTER_MS / 1000}s entre envíos WA`);
  return client;
}

// Errores que sugieren "el wid no resolvió" — incluye el "t" minificado
// que vimos en whatsapp-web.js cuando le pasás un LID con sufijo @c.us.
const LID_ERR_RE = /No LID for user|invalid wid|not.{0,10}registered|^t$/i;

/**
 * Para destinos "crudos" (sin objeto usuario): si el string matchea
 * exactamente el wa_cus o el wa_lid de un usuario activo, devolvemos el
 * que mejor entrega (preferimos @lid si está capturado).
 */
function resolverPorPersistencia(destinoCrudo) {
  if (!destinoCrudo) return destinoCrudo;
  if (destinoCrudo.endsWith('@lid')) return destinoCrudo;
  const digs = destinoCrudo.replace(/\D/g, '');
  if (!digs) return destinoCrudo;
  const todos = usuarios.listarActivos();
  const match = todos.find(u => u.wa_cus && u.wa_cus.replace(/\D/g, '') === digs);
  if (match && match.wa_lid) return match.wa_lid;
  return destinoCrudo;
}

/**
 * Envía texto a un usuario. Maneja:
 *  - elección de wa_lid (preferido) vs wa_cus
 *  - fallback automático si el primer destino tira error de LID/wid
 *  - log saliente en `eventos` (canal=whatsapp, direccion=saliente)
 *  - notificación al watchdog del cliente WA cuando es error no recuperable
 *
 * Devuelve { destinoFinal, enviado: true } en éxito; tira Error en falla.
 *
 * opts:
 *   tag: prefijo para los console.error y el watchdog (ej. "morning-brief/Diego")
 *   metadata: objeto extra que va a `eventos.metadata_json`
 *   logSaliente: default true. Pasar false si el caller loguea por su cuenta.
 */
// ── Fallback de canales (2026-07-04, incidente WA-en-revisión) ─────────────
// Cadena pedida por Diego: WhatsApp → Telegram (si vinculado) → email.
// Aplica a los envíos AUTOMÁTICOS a usuarios (brief, recordatorios, cumples,
// follow-ups, alertas). opts.fallback=false lo desactiva para un caller puntual.
async function _fallbackTGoEmail(usuario, texto, { tag, metadata, errorWA }) {
  // 1) Telegram
  if (usuario.telegram_chat_id && process.env.TELEGRAM_BOT_TOKEN) {
    try {
      const { enviarTG } = require('./telegram-handler'); // lazy: evita ciclos
      await enviarTG(usuario.telegram_chat_id, texto);
      mem.log({ usuarioId: usuario.id, canal: 'telegram', direccion: 'saliente',
        de: 'telegram:' + usuario.telegram_chat_id, nombre: usuario.nombre, cuerpo: texto,
        metadata: { ...(metadata || {}), tag, fallback_de: 'whatsapp' } });
      console.log(`[wa-send] ${tag}: entregado por TELEGRAM (fallback) a ${usuario.nombre}`);
      return { destinoFinal: usuario.telegram_chat_id, enviado: true, canal: 'telegram', fallback: true };
    } catch (e) {
      console.warn(`[wa-send] ${tag}: fallback telegram falló para ${usuario.nombre}:`, e.message);
    }
  }
  // 2) email
  if (usuario.email) {
    try {
      const g = require('./google'); // lazy
      const NOMBRE = process.env.ASISTENTE_NOMBRE || 'Maria';
      const TAGS_ASUNTO = { 'morning-brief': 'tu brief de hoy', 'recordatorio': 'recordatorio', 'follow-ups': 'seguimiento pendiente', 'cumple': 'cumpleaños', 'resumen': 'tu resumen semanal' };
      const base = Object.keys(TAGS_ASUNTO).find(k => String(tag).startsWith(k));
      const asunto = `${NOMBRE} — ${base ? TAGS_ASUNTO[base] : 'mensaje'} (WhatsApp no disponible)`;
      await g.enviarEmail({ to: usuario.email, asunto, texto: `${texto}\n\n—\n(Te escribo por acá porque WhatsApp no está disponible en este momento.)` });
      mem.log({ usuarioId: usuario.id, canal: 'gmail', direccion: 'saliente',
        de: usuario.email, nombre: usuario.nombre, asunto, cuerpo: texto,
        metadata: { ...(metadata || {}), tag, fallback_de: 'whatsapp' } });
      console.log(`[wa-send] ${tag}: entregado por EMAIL (fallback) a ${usuario.nombre}`);
      return { destinoFinal: usuario.email, enviado: true, canal: 'gmail', fallback: true };
    } catch (e) {
      console.warn(`[wa-send] ${tag}: fallback email falló para ${usuario.nombre}:`, e.message);
    }
  }
  throw new Error(`${tag}: WA falló (${errorWA}) y no hubo fallback posible para ${usuario.nombre} (telegram: ${usuario.telegram_chat_id ? 'sí' : 'no'}, email: ${usuario.email ? 'sí' : 'no'})`);
}

async function enviarWAUsuario(client, usuario, texto, opts = {}) {
  const { tag = 'wa-send', metadata = null, logSaliente = true, diferible = false, tz = null, fallback = true } = opts;
  if (!usuario) throw new Error(`${tag}: usuario requerido`);

  // Horas de silencio ANTES que cualquier canal (2026-07-07: antes solo
  // aplicaba al camino WA; con TG-first también Telegram respeta la franja,
  // y en modo degradado ya no pingueamos por TG/email de madrugada). El
  // drainer lo larga a las 8 hora local por el canal que corresponda.
  const _tzU = tz || usuario.tz || null;
  if (diferible && silencio.enSilencio(_tzU)) {
    const _id = mem.encolarWADiferido({
      usuarioId: usuario.id,
      destino: usuario.wa_lid || usuario.wa_cus || null,
      texto, tz: _tzU, tag,
      metadata: { ...(metadata || {}), diferidoDesde: new Date().toISOString() },
    });
    console.log(`[wa-send] ${tag}: en silencio (${_tzU}) → diferido #${_id} hasta las ${silencio.HASTA}h`);
    return { destinoFinal: null, enviado: false, diferido: true, diferidoId: _id };
  }

  // TG-FIRST usuarios (política 2026-07-07, post-bloqueo de la línea): si el
  // usuario está vinculado a Telegram, los envíos automáticos salen por TG
  // antes que por WhatsApp — menos volumen saliente por wwebjs. Si TG falla,
  // sigue el camino WA normal (y su fallback a email).
  if (usuario.telegram_chat_id && process.env.TELEGRAM_BOT_TOKEN) {
    try {
      const { enviarTG } = require('./telegram-handler'); // lazy: evita ciclos
      await enviarTG(usuario.telegram_chat_id, texto);
      if (logSaliente) {
        mem.log({ usuarioId: usuario.id, canal: 'telegram', direccion: 'saliente',
          de: 'telegram:' + usuario.telegram_chat_id, nombre: usuario.nombre, cuerpo: texto,
          metadata: { ...(metadata || {}), tag, via: 'tg_first' } });
      }
      console.log(`[wa-send] ${tag}: entregado por TELEGRAM (tg-first) a ${usuario.nombre}`);
      return { destinoFinal: usuario.telegram_chat_id, enviado: true, canal: 'telegram' };
    } catch (e) {
      console.warn(`[wa-send] ${tag}: tg-first falló para ${usuario.nombre} (${e.message}) — sigo por WA`);
    }
  }

  if (!client) {
    if (!fallback) throw new Error(`${tag}: waClient requerido`);
    return _fallbackTGoEmail(usuario, texto, { tag, metadata, errorWA: 'sin cliente WA' });
  }

  // Orden de preferencia: @lid primero (formato moderno, no requiere
  // libreta), después @c.us como fallback.
  const candidatos = [];
  if (usuario.wa_lid) candidatos.push(usuario.wa_lid);
  if (usuario.wa_cus) candidatos.push(usuario.wa_cus);
  if (!candidatos.length) {
    if (fallback) return _fallbackTGoEmail(usuario, texto, { tag, metadata, errorWA: 'sin destinos WA' });
    throw new Error(`${tag}: usuario ${usuario.nombre} sin destinos WA (wa_lid y wa_cus vacíos)`);
  }

  let lastErr = null;
  try {
  for (const destino of candidatos) {
    try {
      await client.sendMessage(destino, texto);
      if (logSaliente) {
        mem.log({
          usuarioId: usuario.id,
          canal: 'whatsapp', direccion: 'saliente',
          de: destino, nombre: usuario.nombre, cuerpo: texto,
          metadata: { ...(metadata || {}), destinoFinal: destino, tag },
        });
      }
      return { destinoFinal: destino, enviado: true };
    } catch (err) {
      lastErr = err;
      const esLidErr = LID_ERR_RE.test(err.message || '');
      if (!esLidErr) {
        if (client._watchdogFrameMuerto) client._watchdogFrameMuerto(err, tag);
        throw err;
      }
      // Si es error de LID/wid, probamos el siguiente candidato (fallback).
    }
  }

  // Todos los candidatos fallaron con error de LID/wid.
  if (client._watchdogFrameMuerto) client._watchdogFrameMuerto(lastErr, tag);
  throw new Error(`${tag}: no entregué a ${usuario.nombre} (probé: ${candidatos.join(', ')}); último error: ${lastErr?.message || lastErr}`);
  } catch (errWA) {
    if (!fallback) throw errWA;
    console.warn(`[wa-send] ${tag}: WA falló para ${usuario.nombre} (${errWA.message}) — pruebo telegram/email`);
    return _fallbackTGoEmail(usuario, texto, { tag, metadata, errorWA: errWA.message });
  }
}

/**
 * Envía a un destino crudo (terceros, programados con destino libre).
 * Si el destino matchea un usuario activo, preferimos su wa_lid.
 * En caso de error de LID/wid, reintenta con el alternativo.
 *
 * opts:
 *   tag, metadata, logSaliente (igual que enviarWAUsuario)
 *   usuarioId: para asociar el evento saliente a un usuario (opcional)
 */
async function enviarWADirecto(client, destinoCrudo, texto, opts = {}) {
  const { tag = 'wa-send-directo', metadata = null, logSaliente = true, usuarioId = null, diferible = false, tz = null } = opts;
  if (!client) throw new Error(`${tag}: waClient requerido`);
  if (!destinoCrudo) throw new Error(`${tag}: destino vacío`);

  // Horas de silencio (ver enviarWAUsuario). Si no nos pasaron tz, intentamos
  // resolverla por el destino (si matchea un usuario activo).
  if (diferible) {
    let _tzD = tz;
    if (!_tzD) { try { const _u = usuarios.resolverPorWa(destinoCrudo); if (_u) _tzD = _u.tz; } catch { /* noop */ } }
    if (silencio.enSilencio(_tzD)) {
      const _id = mem.encolarWADiferido({
        usuarioId, destino: destinoCrudo, texto, tz: _tzD, tag,
        metadata: { ...(metadata || {}), diferidoDesde: new Date().toISOString() },
      });
      console.log(`[wa-send] ${tag}: en silencio (${_tzD || 'tz?'}) → diferido #${_id} hasta las ${silencio.HASTA}h`);
      return { destinoFinal: null, enviado: false, diferido: true, diferidoId: _id };
    }
  }

  const intento1 = resolverPorPersistencia(destinoCrudo);
  let destinoFinal = intento1;
  let resueltoVia = null;
  try {
    await client.sendMessage(intento1, texto);
  } catch (err) {
    const esLidErr = LID_ERR_RE.test(err.message || '');
    if (!esLidErr) {
      if (client._watchdogFrameMuerto) client._watchdogFrameMuerto(err, tag);
      throw err;
    }

    // Si intento1 es @c.us y falló por LID, pedirle a WA Web que resuelva el
    // wid del número via getNumberId(). Esto cubre el caso "iniciar
    // conversación con número nuevo": WA aún no descubrió el @lid del
    // destinatario, así que sendMessage al @c.us crudo rebota con "No LID
    // for user". getNumberId() hace lookup en los servers de WA y devuelve
    // el wid resuelto (puede ser @c.us con hash o @lid). Solo aplica si el
    // destinoCrudo no matchea a ningún usuario activo (los usuarios ya
    // tienen sus dos slots persistidos, ese fallback lo cubre abajo).
    let widResuelto = null;
    if (intento1.endsWith('@c.us')) {
      try {
        const numero = intento1.replace(/@c\.us$/, '');
        const wid = await client.getNumberId(numero);
        if (wid && wid._serialized && wid._serialized !== intento1) {
          widResuelto = wid._serialized;
        }
      } catch { /* getNumberId puede tirar; seguimos al fallback de usuarios */ }
    }

    if (widResuelto) {
      await client.sendMessage(widResuelto, texto);
      destinoFinal = widResuelto;
      resueltoVia = 'getNumberId';
    } else {
      // Buscar alternativo: si hay usuario que matchee, probar el otro slot.
      const u = usuarios.resolverPorWa(destinoCrudo);
      const alt = u && u.wa_lid && u.wa_lid !== intento1 ? u.wa_lid
                : u && u.wa_cus && u.wa_cus !== intento1 ? u.wa_cus
                : null;
      if (!alt) {
        if (client._watchdogFrameMuerto) client._watchdogFrameMuerto(err, tag);
        throw err;
      }
      await client.sendMessage(alt, texto);
      destinoFinal = alt;
      resueltoVia = 'usuario-alt';
    }
  }

  if (logSaliente) {
    mem.log({
      usuarioId,
      canal: 'whatsapp', direccion: 'saliente',
      de: destinoFinal, cuerpo: texto,
      metadata: { ...(metadata || {}), destinoOriginal: destinoCrudo, destinoFinal, tag, ...(resueltoVia ? { resueltoVia } : {}) },
    });

    // BUG F FIX: si el destinatario es un usuario activo distinto del emisor,
    // loggear el mismo saliente ASOCIADO a su usuario_id también. Así, cuando
    // el destinatario responda, su historial cross-canal incluye lo que Maria
    // le mandó (aunque la acción haya sido pedida por otro usuario).
    // Sin esto: A le pide a Maria escribir a B (activo). Cuando B responde,
    // Maria no ve su propio mensaje en el historial de B y lo trata como
    // conversación nueva.
    try {
      const receptor = usuarios.resolverPorWa(destinoFinal);
      if (receptor && receptor.id && receptor.id !== usuarioId) {
        mem.log({
          usuarioId: receptor.id,
          canal: 'whatsapp', direccion: 'saliente',
          de: destinoFinal, cuerpo: texto,
          metadata: {
            ...(metadata || {}),
            destinoOriginal: destinoCrudo,
            destinoFinal,
            tag: `${tag}+mirror`,
            mirroredFrom: usuarioId,
            ...(resueltoVia ? { resueltoVia } : {}),
          },
        });
      }
    } catch (err) {
      // no fatal — el log principal ya quedó
      console.warn(`[wa-send] mirror log al receptor falló: ${err.message}`);
    }
  }
  return { destinoFinal, enviado: true };
}

module.exports = {
  aplicarEmbudo,
  embudoWA, enviarWAUsuario, enviarWADirecto, resolverPorPersistencia, LID_ERR_RE };
