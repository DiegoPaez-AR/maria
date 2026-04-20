// whatsapp-handler.js — handler unificado de mensajes de WhatsApp
//
// Reemplaza toda la lógica de whatsapp.js (procesarMensajeDiego / procesarMensajeExterno).
// Ahora es canal-agnóstico: cualquier mensaje entrante pasa por la misma pipeline:
//
//   1) si es vcard → upsertContacto y confirmamos
//   2) si es audio → transcribir con whisper
//   3) log al memory (canal='whatsapp', direccion='entrante')
//   4) construir prompt con contexto cross-canal
//   5) invocar Claude (stdin) → JSON { respuesta, acciones, razonamiento }
//   6) enviar respuesta por WA + log saliente
//   7) ejecutar acciones (crear_evento, enviar_wa, responder_email, …)
//
// Uso:
//   const { crearClienteWA } = require('./whatsapp-handler');
//   const client = crearClienteWA({ onReady: (c) => { ... } });
//   client.initialize();

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const mem = require('./memory');
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
  // Lo adjuntamos al client para que el resto del handler lo use.
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

  const messageId = msg.id?._serialized || msg.id?.id || null;

  // 1) vCard → upsert contacto
  if (msg.type === 'vcard') {
    return await _manejarVCard(client, msg);
  }

  // 2) Cuerpo: texto o audio transcripto
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

  // 3) Identificar remitente
  let pushname = null;
  try {
    const contact = await msg.getContact();
    pushname = contact?.pushname || contact?.name || null;
  } catch {}
  const contactoDB = mem.buscarContacto({ whatsapp: msg.from });
  const nombre = contactoDB?.nombre || pushname || msg.from;

  // Capturar el @lid de Diego la primera vez que escribe, para poder
  // responderle después (WA Web moderno no acepta @c.us para usuarios
  // que no están en la libreta de Maria).
  const pareceDiego =
    contactoDB?.nombre === 'Diego' ||
    pushname === 'Diego Paez' ||
    msg.from === (process.env.DIEGO_WA || '541132317896@c.us');
  if (pareceDiego && msg.from && msg.from.endsWith('@lid')) {
    const actual = mem.getEstado('diego_wa_lid');
    if (actual !== msg.from) {
      mem.setEstado('diego_wa_lid', msg.from);
      // También actualizamos el contacto para que el próximo mensaje lo
      // matchee por whatsapp directamente (sin depender del pushname).
      try {
        mem.upsertContacto({ nombre: 'Diego', whatsapp: msg.from });
      } catch (e) {
        console.warn('[WA] upsertContacto(Diego) falló:', e.message);
      }
      console.log(`[WA] capturado @lid de Diego: ${msg.from}`);
      mem.log({
        canal: 'sistema', direccion: 'interno',
        cuerpo: `LID de Diego actualizado: ${msg.from}`,
      });
    }
  }

  // Auto-upsert de terceros nuevos — así cuando Diego le pida a Maria
  // responderles, el wa id queda accesible en la libreta.
  if (!pareceDiego && !contactoDB && pushname && msg.from) {
    try {
      mem.upsertContacto({
        nombre: pushname,
        whatsapp: msg.from,
        notas: 'auto-agregado al recibir primer mensaje',
      });
      console.log(`[WA] auto-agregado contacto: ${pushname} → ${msg.from}`);
      mem.log({
        canal: 'sistema', direccion: 'interno',
        cuerpo: `contacto auto-agregado: ${pushname} → ${msg.from}`,
      });
    } catch (e) {
      // Puede fallar si ya existe alguien con ese nombre pero otro whatsapp —
      // no lo pisamos (COALESCE en el upsert), seguimos normal.
    }
  }

  console.log(`[WA ←] ${nombre} (${msg.from})${esAudio ? ' 🎤' : ''}: ${cuerpo.slice(0, 160)}`);

  // 4) Log entrante
  mem.log({
    canal: 'whatsapp', direccion: 'entrante',
    de: msg.from, nombre, cuerpo,
    tipo_original: msg.type,
    metadata: { messageId, esAudio, pushname },
  });

  // 5) Construir prompt
  const prompt = await construirPrompt({
    canal: 'whatsapp',
    entrada: { de: msg.from, nombre, cuerpo, esAudio, messageId },
  });

  // 6) Invocar Claude
  let respuesta = '';
  let acciones = [];
  let razonamiento = null;
  try {
    const { json } = await invocarClaudeJSON(prompt);
    respuesta    = (json.respuesta || '').toString();
    acciones     = Array.isArray(json.acciones) ? json.acciones : [];
    razonamiento = json.razonamiento || null;
  } catch (err) {
    console.error('[WA] Claude falló:', err.message);
    mem.log({
      canal: 'sistema', direccion: 'interno',
      cuerpo: `Claude falló en WA: ${err.message}`,
      metadata: { from: msg.from, messageId },
    });
    await client.sendMessage(msg.from, '(Maria tuvo un problema — avisale a Diego)');
    return;
  }

  // 7) Enviar respuesta
  if (respuesta.trim()) {
    try {
      await client.sendMessage(msg.from, respuesta);
      mem.log({
        canal: 'whatsapp', direccion: 'saliente',
        de: msg.from, nombre, cuerpo: respuesta,
        metadata: { razonamiento, inReplyTo: messageId },
      });
      console.log(`[WA →] ${nombre}: ${respuesta.slice(0, 160)}`);
    } catch (err) {
      console.error('[WA] enviar respuesta falló:', err.message);
      if (client._watchdogFrameMuerto) client._watchdogFrameMuerto(err, 'sendMessage respuesta');
    }
  }

  // 8) Ejecutar acciones
  if (acciones.length) {
    const resultados = await ejecutarAcciones(acciones, {
      waClient: client, canalOrigen: 'whatsapp',
    });
    const ok = resultados.filter(r => r.ok).length;
    console.log(`[WA acciones] ${ok}/${resultados.length} ejecutadas`);
  }
}

// ─── vCard ─────────────────────────────────────────────────────────────

async function _manejarVCard(client, msg) {
  const nombreMatch = msg.body.match(/FN:(.+)/);
  const telMatch    = msg.body.match(/TEL[^:]*:(.+)/);
  if (!nombreMatch || !telMatch) return;

  const nombre  = nombreMatch[1].trim();
  const numero  = telMatch[1].trim().replace(/\D/g, '');
  if (!nombre || !numero) return;
  const waId = numero.endsWith('@c.us') ? numero : `${numero}@c.us`;

  mem.upsertContacto({ nombre, whatsapp: waId });
  mem.log({
    canal: 'sistema', direccion: 'interno',
    cuerpo: `contacto vcard: ${nombre} → ${waId}`,
    metadata: { origen: msg.from },
  });
  console.log(`📒 [WA vcard] ${nombre} → ${waId}`);
  await client.sendMessage(msg.from, `📒 Guardé el contacto de ${nombre}.`);
}

module.exports = { crearClienteWA, handleMessage };
