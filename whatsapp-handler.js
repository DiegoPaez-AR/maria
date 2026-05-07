// whatsapp-handler.js — handler unificado de mensajes de WhatsApp (multi-user)
//
// Pipeline canal-agnóstico. Cada mensaje entrante:
//   0) resolver quién es el remitente vía usuarios.resolverPorWa(msg.from).
//      - si es un usuario registrado → pipeline normal con ctx.usuario = él.
//      - si es desconocido → delegamos a unknown-flow (pide a quién va, matchea,
//        y cuando matchea re-entra a esta misma pipeline como si el mensaje le
//        hubiera llegado directo al usuario destinatario).
//   1) si es vcard → upsertContacto (libreta del usuario)
//   2) si es audio → transcribir con whisper
//   3) log al memory (usuario_id=usuario.id, canal='whatsapp', dir='entrante')
//   4) construir prompt con contexto del usuario
//   5) invocar Claude → { respuesta, acciones, razonamiento }
//   6) enviar respuesta por WA + log saliente
//   7) ejecutar acciones con ctx = { usuario, waClient, canalOrigen }

const { Client, LocalAuth } = require('whatsapp-web.js');
const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode-terminal');

const mem = require('./memory');
const usuarios = require('./usuarios');
const unknownFlow = require('./unknown-flow');
const { transcribirAudio } = require('./transcribir');
const { construirPrompt } = require('./prompt-builder');
const { invocarClaudeJSON } = require('./claude-client');
const { ejecutarAcciones } = require('./executor');

const CHROME_BIN = process.env.CHROME_BIN || '/usr/bin/google-chrome';

function crearClienteWA({ onReady } = {}) {
  const client = new Client({
    authStrategy: new LocalAuth(),
    // webVersionCache DESHABILITADO — causaba crashes cuando WA Web actualizaba su protocolo.
    puppeteer: {
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
      ],
      executablePath: CHROME_BIN,
    },
  });

  // ─── Eventos de ciclo de vida ──────────────────────────────────────────
  client.on('qr', (qr) => {
    console.log('[WA qr] escaneá este QR:');
    qrcode.generate(qr, { small: true });
  });
  client.on('loading_screen', (pct, msg) => console.log(`[WA loading] ${pct}% - ${msg}`));
  client.on('authenticated',  ()   => console.log('[WA authenticated]'));
  client.on('auth_failure',   (m)  => console.error('[WA auth_failure]', m));
  client.on('change_state',   (s)  => console.log('[WA change_state]', s));
  client.on('disconnected',   (r)  => {
    console.error('[WA disconnected]', r);
    mem.log({
      canal: 'sistema', direccion: 'interno',
      cuerpo: `WA disconnected: ${r} — saliendo para que pm2 reinicie`,
    });
    // Dejamos que pm2 levante el proceso — auto-recuperación.
    setTimeout(() => process.exit(1), 500);
  });
  client.on('ready', () => {
    console.log('✅ [WA ready] Maria conectada');
    if (typeof onReady === 'function') onReady(client);
  });

  // ─── Watchdog: detectar frame detached y suicidarnos ───────────────────
  // whatsapp-web.js no siempre dispara 'disconnected' cuando el iframe de
  // WA Web se muere. Vigilamos cualquier llamada que falle con
  // "detached Frame" / "Target closed" y forzamos exit — pm2 levanta.
  function _esFrameMuerto(err) {
    const m = String(err?.message || err || '');
    return /detached Frame|Target closed|Session closed|Execution context was destroyed|Protocol error.*\b(Runtime|Page)\b/i.test(m);
  }
  let _suicidandose = false;
  function _suicidarSiFrameMuerto(err, origen) {
    if (!_esFrameMuerto(err) || _suicidandose) return false;
    _suicidandose = true;
    console.error(`[WA watchdog] frame muerto detectado en ${origen} — saliendo:`, err.message);
    mem.log({
      canal: 'sistema', direccion: 'interno',
      cuerpo: `WA frame muerto (${origen}): ${err.message} — pm2 reinicia`,
    });
    setTimeout(() => process.exit(1), 500);
    return true;
  }
  client._watchdogFrameMuerto = _suicidarSiFrameMuerto;

  // ─── Mensajes entrantes ─────────────────────────────────────────────────
  client.on('message', async (msg) => {
    try {
      await handleMessage(client, msg);
    } catch (err) {
      console.error('[WA handler] error no manejado:', err);
      mem.log({
        canal: 'sistema', direccion: 'interno',
        cuerpo: `WA handler crasheó: ${err.message}`,
        metadata: { stack: err.stack, from: msg.from },
      });
    }
  });

  return client;
}

// ─── Procesamiento de un mensaje (pre-proceso + debouncing) ─────────────
//
// Cuando un user manda dos mensajes seguidos (ej: la imagen y después "es
// este"), WA Web los entrega como dos eventos en el mismo segundo. Si los
// procesamos por separado, María responde dos veces — una sin contexto y
// otra con. Para evitarlo, encolamos los mensajes por chat (`from`) y
// esperamos `WA_DEBOUNCE_MS` (default 5s) antes de despacharlos. Cualquier
// mensaje del mismo chat que llegue dentro de ese rato se suma al grupo.
// Cuando el timer expira, llamamos al LLM UNA sola vez con el cuerpo
// combinado y los adjuntos acumulados.

const _DEBOUNCE_MS = Number(process.env.WA_DEBOUNCE_MS || 10000);
const _colas = new Map(); // from → { items, timer }

async function handleMessage(client, msg) {
  if (msg.fromMe) return;

  // Resolver pushname, contact, messageId temprano.
  let pushname = null;
  let contact = null;
  try {
    contact = await msg.getContact();
    pushname = contact?.pushname || contact?.name || null;
  } catch {}
  const messageId = msg.id?._serialized || msg.id?.id || null;

  // Caso especial: vCard → libreta del usuario que la manda. Va directo,
  // sin debouncing — es metadata, no parte del flujo conversacional.
  if (msg.type === 'vcard') {
    const usuario = usuarios.resolverPorWa(msg.from);
    if (!usuario) return;
    return await _manejarVCard(client, msg, usuario);
  }

  // Pre-procesar: extraer texto / transcribir audio / descargar media.
  // Esto se hace ANTES del debouncing para que cuando el timer expire ya
  // tengamos todo listo (los attachments en /tmp, los audios transcriptos).
  const item = await _preProcesarMensaje(client, msg, { pushname, contact, messageId });
  if (!item) return; // sticker / vacío / fallo de transcripción

  _encolar(client, msg.from, item);
}

async function _preProcesarMensaje(client, msg, { pushname, contact, messageId }) {
  let cuerpo = (msg.body || '').trim();
  let esAudio = false;
  let mediaMeta = null;
  let attachmentPath = null;

  // Audio → transcribir con whisper.
  if (msg.type === 'ptt' || msg.type === 'audio') {
    try {
      const media = await msg.downloadMedia();
      if (!media) {
        console.warn('[WA] audio sin media');
        await client.sendMessage(msg.from, '(no pude descargar el audio, mandame texto)');
        return null;
      }
      console.log('[WA] transcribiendo audio…');
      cuerpo = await transcribirAudio(media);
      esAudio = true;
      console.log(`[WA audio→texto] ${cuerpo.slice(0, 160)}`);
    } catch (err) {
      console.error('[WA] transcripción falló:', err.message);
      mem.log({
        canal: 'sistema', direccion: 'interno',
        cuerpo: `transcripción WA falló: ${err.message}`,
        metadata: { from: msg.from, messageId },
      });
      await client.sendMessage(msg.from, '(no pude transcribir tu audio — mandamelo en texto)');
      return null;
    }
  }

  // Media (imagen / video / documento / etc). Lo procesamos AUNQUE haya
  // texto (caption + media en un solo evento es válido), excepto stickers
  // y audios (que ya pasaron arriba).
  if (msg.hasMedia && msg.type !== 'sticker' && msg.type !== 'ptt' && msg.type !== 'audio') {
    const filename = msg._data?.filename || null;
    const mime     = msg._data?.mimetype || msg.type || 'archivo';
    const sizeKb   = msg._data?.size ? Math.round(msg._data.size / 1024) : null;
    mediaMeta = { filename, mime, sizeKb };
    if (!cuerpo) {
      cuerpo = `(adjuntó ${filename || mime}${sizeKb ? `, ${sizeKb} KB` : ''})`;
    }

    // Visión multimodal: imágenes y PDFs los bajamos a /tmp para que
    // Claude Code los lea con su tool Read vía @path.
    const esImagenOPdf = /^image\//i.test(mime) || /^application\/pdf$/i.test(mime);
    const MAX_BYTES = 20 * 1024 * 1024;
    if (esImagenOPdf && msg._data?.size && msg._data.size <= MAX_BYTES) {
      try {
        const media = await msg.downloadMedia();
        if (media?.data) {
          let ext = '';
          if (filename && /\.[a-z0-9]+$/i.test(filename)) {
            ext = filename.match(/\.[a-z0-9]+$/i)[0];
          } else if (/^image\/jpe?g$/i.test(mime)) ext = '.jpg';
          else if (/^image\/png$/i.test(mime))    ext = '.png';
          else if (/^image\/webp$/i.test(mime))   ext = '.webp';
          else if (/^image\/gif$/i.test(mime))    ext = '.gif';
          else if (/^application\/pdf$/i.test(mime)) ext = '.pdf';
          else ext = '.bin';
          const safeId = (messageId || `wa-${Date.now()}`).replace(/[^A-Za-z0-9_.-]/g, '_');
          const tmpPath = path.join('/tmp', `maria-attach-${safeId}${ext}`);
          fs.writeFileSync(tmpPath, Buffer.from(media.data, 'base64'));
          attachmentPath = tmpPath;
          console.log(`[WA] media → ${tmpPath} (${sizeKb} KB)`);
        }
      } catch (err) {
        console.warn(`[WA] no pude descargar media de ${messageId}: ${err.message}`);
      }
    }
  }

  if (!cuerpo) return null; // nada que procesar

  return { cuerpo, esAudio, mediaMeta, attachmentPath, messageId, pushname, contact, msg };
}

function _encolar(client, from, item) {
  let q = _colas.get(from);
  if (!q) {
    q = { items: [], timer: null };
    _colas.set(from, q);
  }
  q.items.push(item);
  if (q.timer) clearTimeout(q.timer);
  q.timer = setTimeout(() => {
    const items = q.items;
    _colas.delete(from);
    _despacharGrupo(client, from, items).catch(err => {
      console.error(`[WA debounce] error despachando grupo de ${from}:`, err);
    });
  }, _DEBOUNCE_MS);
}

async function _despacharGrupo(client, from, items) {
  if (!items.length) return;
  const principal = items[0];
  const cuerpoCombinado  = items.map(i => i.cuerpo).filter(Boolean).join('\n');
  const attachmentPaths  = items.flatMap(i => i.attachmentPath ? [i.attachmentPath] : []);
  const algunMedia       = items.some(i => i.mediaMeta);
  const algunAudio       = items.some(i => i.esAudio);
  const messageId        = principal.messageId;
  const pushname         = principal.pushname;
  const contact          = principal.contact;
  const msgOriginal      = principal.msg;

  let usuario = usuarios.resolverPorWa(from);

  if (!usuario) {
    // Desconocido → unknown-flow. Pasamos el cuerpo combinado y, en el
    // reprocesar (cuando matchee a un user), propagamos los attachments.
    try {
      await unknownFlow.handleWA({
        client,
        msg: msgOriginal,
        contact,
        cuerpo: cuerpoCombinado,
        reprocesarComoUsuario: async (usuarioDestino, entrada) => {
          await _procesarComoUsuario({
            client,
            usuario: usuarioDestino,
            entrada: {
              ...entrada,
              ...(attachmentPaths.length ? { attachmentPaths } : {}),
            },
            msgOriginal,
          });
        },
      });
    } finally {
      for (const p of attachmentPaths) { try { fs.unlinkSync(p); } catch {} }
    }
    return;
  }

  // Captura del @lid del user la primera vez que escribe.
  if (from && from.endsWith('@lid') && usuario.wa_lid !== from) {
    usuarios.setWaLid(usuario.id, from);
    usuario = usuarios.obtener(usuario.id);
    console.log(`[WA] capturado @lid de ${usuario.nombre}: ${from}`);
    mem.log({
      usuarioId: usuario.id,
      canal: 'sistema', direccion: 'interno',
      cuerpo: `LID de ${usuario.nombre} actualizado: ${from}`,
    });
  }

  const nombre = usuario.nombre || pushname || from;
  const tagAgrupado = items.length > 1 ? ` [${items.length} msgs agrupados]` : '';
  console.log(`[WA ←] ${nombre} (${from})${algunAudio ? ' 🎤' : ''}${tagAgrupado}: ${cuerpoCombinado.slice(0, 160)}`);

  // Cada item se loguea individualmente para preservar historial granular.
  for (const it of items) {
    mem.log({
      usuarioId: usuario.id,
      canal: 'whatsapp', direccion: 'entrante',
      de: from, nombre, cuerpo: it.cuerpo,
      tipo_original: it.msg.type,
      metadata: {
        messageId: it.messageId, esAudio: it.esAudio, pushname,
        ...(it.mediaMeta ? { esMedia: true, ...it.mediaMeta } : {}),
        ...(it.attachmentPath ? { attachmentPath: it.attachmentPath } : {}),
      },
    });
  }

  try {
    await _procesarComoUsuario({
      client,
      usuario,
      entrada: {
        de: from,
        nombre,
        cuerpo: cuerpoCombinado,
        esAudio: algunAudio,
        messageId,
        ...(algunMedia ? { esMedia: true } : {}),
        ...(attachmentPaths.length ? { attachmentPaths } : {}),
      },
      msgOriginal,
    });
  } finally {
    for (const p of attachmentPaths) { try { fs.unlinkSync(p); } catch {} }
  }
}

/**
 * Pipeline post-resolución de usuario: prompt → Claude → respuesta →
 * acciones. Se invoca tanto para mensajes de usuarios conocidos como para
 * mensajes reencaminados desde unknown-flow.
 */
async function _procesarComoUsuario({ client, usuario, entrada, msgOriginal }) {
  const prompt = await construirPrompt({
    usuario,
    canal: 'whatsapp',
    entrada,
  });

  let respUsr = '';
  let respRem = '';
  let acciones = [];
  let razonamiento = null;
  try {
    const { json } = await invocarClaudeJSON(prompt);
    respUsr      = (json.respuesta_a_usuario   || '').toString();
    respRem      = (json.respuesta_a_remitente || '').toString();
    // Compat: si solo viene `respuesta` legacy, en WA se trata como
    // respuesta al usuario atendido (mantiene comportamiento previo).
    if (!respUsr && !respRem && json.respuesta) {
      respUsr = json.respuesta.toString();
    }
    acciones     = Array.isArray(json.acciones) ? json.acciones : [];
    razonamiento = json.razonamiento || null;
  } catch (err) {
    console.error(`[WA/${usuario.nombre}] Claude falló:`, err.message);
    mem.log({
      usuarioId: usuario.id,
      canal: 'sistema', direccion: 'interno',
      cuerpo: `Claude falló en WA (${usuario.nombre}): ${err.message}`,
      metadata: { from: entrada.de, messageId: entrada.messageId },
    });
    // Silencio: NO mandamos "Maria tuvo un problema" — el usuario prefiere silencio
    // a ruido. Si pasa seguido, se ve en los logs.
    return;
  }

  // Destinos:
  //   destinoUsuario   = wa del usuario atendido
  //   destinoRemitente = wa de quien escribió este mensaje (puede ser el
  //                      usuario en flujo normal, o un tercero si vino
  //                      reprocesado desde unknown-flow).
  const destinoUsuario   = usuario.wa_lid || usuario.wa_cus || null;
  const destinoRemitente = entrada.de || destinoUsuario;
  const remitenteEsUsuario =
    !!destinoUsuario && !!entrada.de &&
    (entrada.de === usuario.wa_lid || entrada.de === usuario.wa_cus);

  // 1) Mandar al usuario atendido (si hay texto y destino).
  if (respUsr.trim() && destinoUsuario) {
    try {
      await client.sendMessage(destinoUsuario, respUsr);
      mem.log({
        usuarioId: usuario.id,
        canal: 'whatsapp', direccion: 'saliente',
        de: destinoUsuario, nombre: usuario.nombre, cuerpo: respUsr,
        metadata: { razonamiento, inReplyTo: entrada.messageId, slot: 'respuesta_a_usuario' },
      });
      console.log(`[WA →usr] ${usuario.nombre} (${destinoUsuario}): ${respUsr.slice(0, 160)}`);
    } catch (err) {
      console.error('[WA] enviar respuesta_a_usuario falló:', err.message);
      if (client._watchdogFrameMuerto) client._watchdogFrameMuerto(err, 'sendMessage respuesta_a_usuario');
    }
  }

  // 2) Mandar al remitente (si hay texto, hay destino, y NO es el mismo
  //    chat que el usuario — evitamos doble mensaje en flujo normal).
  if (respRem.trim() && destinoRemitente && !remitenteEsUsuario) {
    try {
      await client.sendMessage(destinoRemitente, respRem);
      mem.log({
        usuarioId: usuario.id,
        canal: 'whatsapp', direccion: 'saliente',
        de: destinoRemitente, nombre: entrada.nombre, cuerpo: respRem,
        metadata: { razonamiento, inReplyTo: entrada.messageId, slot: 'respuesta_a_remitente', tercero: true },
      });
      console.log(`[WA →3ro] ${usuario.nombre}/${entrada.nombre || destinoRemitente}: ${respRem.slice(0, 160)}`);
    } catch (err) {
      console.error('[WA] enviar respuesta_a_remitente falló:', err.message);
      if (client._watchdogFrameMuerto) client._watchdogFrameMuerto(err, 'sendMessage respuesta_a_remitente');
    }
  } else if (respRem.trim() && remitenteEsUsuario && !respUsr.trim()) {
    // Caso edge: flujo normal y el LLM puso el texto en respuesta_a_remitente
    // en vez de respuesta_a_usuario. Para no perder el mensaje, lo mandamos
    // al usuario (que es el remitente).
    try {
      await client.sendMessage(destinoUsuario, respRem);
      mem.log({
        usuarioId: usuario.id,
        canal: 'whatsapp', direccion: 'saliente',
        de: destinoUsuario, nombre: usuario.nombre, cuerpo: respRem,
        metadata: { razonamiento, inReplyTo: entrada.messageId, slot: 'respuesta_a_remitente_redirected_to_usuario' },
      });
      console.log(`[WA →usr] ${usuario.nombre} (${destinoUsuario}) [via respuesta_a_remitente]: ${respRem.slice(0, 160)}`);
    } catch (err) {
      console.error('[WA] enviar respuesta (redirect) falló:', err.message);
      if (client._watchdogFrameMuerto) client._watchdogFrameMuerto(err, 'sendMessage redirect');
    }
  }

  if (acciones.length) {
    const resultados = await ejecutarAcciones(acciones, {
      usuario,
      waClient: client,
      canalOrigen: 'whatsapp',
    });
    const ok = resultados.filter(r => r.ok).length;
    console.log(`[WA acciones/${usuario.nombre}] ${ok}/${resultados.length} ejecutadas`);
  }
}

// ─── vCard ─────────────────────────────────────────────────────────────

async function _manejarVCard(client, msg, usuario) {
  const nombreMatch = msg.body.match(/FN:(.+)/);
  const telMatch    = msg.body.match(/TEL[^:]*:(.+)/);
  if (!nombreMatch || !telMatch) return;

  const nombre  = nombreMatch[1].trim();
  const numero  = telMatch[1].trim().replace(/\D/g, '');
  if (!nombre || !numero) return;
  const waId = numero.endsWith('@c.us') ? numero : `${numero}@c.us`;

  mem.upsertContacto({ usuarioId: usuario.id, nombre, whatsapp: waId });
  mem.log({
    usuarioId: usuario.id,
    canal: 'sistema', direccion: 'interno',
    cuerpo: `contacto vcard: ${nombre} → ${waId}`,
    metadata: { origen: msg.from },
  });
  console.log(`📒 [WA vcard/${usuario.nombre}] ${nombre} → ${waId}`);
  await client.sendMessage(msg.from, `📒 Guardé el contacto de ${nombre}.`);
}

module.exports = { crearClienteWA, handleMessage };
