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

// ─── Procesamiento de un mensaje ─────────────────────────────────────────

async function handleMessage(client, msg) {
  if (msg.fromMe) return;

  // Resolver pushname y messageId temprano (los usa todo el flujo).
  let pushname = null;
  let _contactRef = null; // [debug @lid] guardado para dump de inspección
  try {
    const contact = await msg.getContact();
    pushname = contact?.pushname || contact?.name || null;
    _contactRef = contact;
  } catch {}
  const messageId = msg.id?._serialized || msg.id?.id || null;

  // Caso especial: vCard → libreta del usuario que la manda.
  // Si el que la manda es desconocido, salteamos (no es un mensaje de texto,
  // que la pida un usuario real).
  if (msg.type === 'vcard') {
    const usuario = usuarios.resolverPorWa(msg.from);
    if (!usuario) return; // vcards de desconocidos las ignoramos
    return await _manejarVCard(client, msg, usuario);
  }

  // Extraer cuerpo (texto o audio transcripto).
  let cuerpo = (msg.body || '').trim();
  let esAudio = false;

  if (msg.type === 'ptt' || msg.type === 'audio') {
    try {
      const media = await msg.downloadMedia();
      if (!media) {
        console.warn('[WA] audio sin media');
        await client.sendMessage(msg.from, '(no pude descargar el audio, mandame texto)');
        return;
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
      return;
    }
  }

  if (!cuerpo) return; // imágenes, stickers, etc. — ignoramos por ahora

  // ─── Resolver usuario ──────────────────────────────────────────────────
  let usuario = usuarios.resolverPorWa(msg.from);

  if (!usuario) {
    // [debug @lid] — dump temporal: cuando un desconocido escribe con @lid,
    // queremos saber si msg.getContact() expone el @c.us real (vía
    // contact.id._serialized, contact.number, _data.id, etc). Esto se quita
    // cuando tengamos los datos.
    if (msg.from && msg.from.endsWith('@lid')) {
      try {
        const c = _contactRef;
        const cId = c?.id;
        const cData = c?._data || null;
        console.log(`[wa-debug @lid] msg.from=${msg.from} pushname=${pushname || 'n/a'} msg.author=${msg.author || 'n/a'}`);
        console.log(`[wa-debug @lid] contact.id._serialized=${cId?._serialized || 'n/a'} contact.id.user=${cId?.user || 'n/a'} contact.id.server=${cId?.server || 'n/a'}`);
        console.log(`[wa-debug @lid] contact.number=${c?.number || 'n/a'} contact.isMyContact=${c?.isMyContact} contact.isWAContact=${c?.isWAContact}`);
        if (cData) {
          const keys = Object.keys(cData).join(',');
          console.log(`[wa-debug @lid] contact._data keys=${keys}`);
          const safe = {};
          for (const k of ['id','phoneNumber','phone','jid','lid','pn','phoneNumberFormatted','number','formattedName','name','shortName','pushname','verifiedName']) {
            if (cData[k] !== undefined) safe[k] = cData[k];
          }
          console.log(`[wa-debug @lid] contact._data subset=${JSON.stringify(safe).slice(0,800)}`);
        }
        if (msg._data) {
          const m = msg._data;
          const subset = { from: m.from, author: m.author, id: m.id, notifyName: m.notifyName, senderObj: m.senderObj };
          console.log(`[wa-debug @lid] msg._data subset=${JSON.stringify(subset).slice(0,800)}`);
        }
      } catch (err) {
        console.log(`[wa-debug @lid] dump falló: ${err.message}`);
      }
    }
    // Desconocido → flujo separado. unknownFlow.handleWA se encarga del
    // ida/vuelta y, si matchea a un usuario, nos llama de vuelta con
    // reprocesarComoUsuario para que procesemos el mensaje original como si
    // le hubiera llegado directo a ese usuario.
    await unknownFlow.handleWA({
      client,
      msg,
      cuerpo,
      reprocesarComoUsuario: async (usuarioDestino, entrada) => {
        await _procesarComoUsuario({
          client,
          usuario: usuarioDestino,
          entrada,
          msgOriginal: msg,
        });
      },
    });
    return;
  }

  // Capturar el @lid del usuario la primera vez que escribe (WA Web moderno).
  if (msg.from && msg.from.endsWith('@lid') && usuario.wa_lid !== msg.from) {
    usuarios.setWaLid(usuario.id, msg.from);
    usuario = usuarios.obtener(usuario.id); // reload
    console.log(`[WA] capturado @lid de ${usuario.nombre}: ${msg.from}`);
    mem.log({
      usuarioId: usuario.id,
      canal: 'sistema', direccion: 'interno',
      cuerpo: `LID de ${usuario.nombre} actualizado: ${msg.from}`,
    });
  }

  const nombre = usuario.nombre || pushname || msg.from;
  console.log(`[WA ←] ${nombre} (${msg.from})${esAudio ? ' 🎤' : ''}: ${cuerpo.slice(0, 160)}`);

  // Log entrante + pipeline.
  mem.log({
    usuarioId: usuario.id,
    canal: 'whatsapp', direccion: 'entrante',
    de: msg.from, nombre, cuerpo,
    tipo_original: msg.type,
    metadata: { messageId, esAudio, pushname },
  });

  await _procesarComoUsuario({
    client,
    usuario,
    entrada: {
      de: msg.from,
      nombre,
      cuerpo,
      esAudio,
      messageId,
    },
    msgOriginal: msg,
  });
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
    // Silencio: NO mandamos "Maria tuvo un problema" — Diego prefiere silencio
    // a ruido. Si pasa seguido, se ve en los logs.
    return;
  }

  // Destinos:
  //   destinoUsuario   = wa del usuario atendido (Diego)
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
