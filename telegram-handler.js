// telegram-handler.js — canal Telegram de RESPALDO (2026-07-03, review 0701
// Parte 6). No es canal principal: es el seguro contra la pérdida del número
// de WhatsApp (whatsapp-web.js es vía no-oficial, ver plan de contingencia).
//
// Diseño v1 (acordado con Diego):
//   - Bot API oficial via fetch nativo (sin deps, estilo lib/stripe.js).
//   - Long polling getUpdates (sin webhook = sin puertos nuevos).
//   - SOLO usuarios vinculados: la identidad la prueba WhatsApp (acción
//     vincular_telegram genera código → el usuario se lo manda al bot).
//     Desconocidos reciben un mensaje fijo. CERO unknown-flow acá.
//   - Turnos de usuarios vinculados van al pipeline completo (prompt + LLM +
//     tools MCP en vivo + backstops por turn-results), respuesta por TG.
//   - Detección WA-caído: si WhatsApp no llega a ready por >10 min, broadcast
//     a los vinculados "seguimos por acá" (una vez, con estado en disco para
//     sobrevivir al QR-loop de restarts) y aviso de recuperación al volver.

const fs = require('fs');
const path = require('path');
const mem = require('./memory');
const usuarios = require('./usuarios');
const seguridad = require('./seguridad');
const turnState = require('./turn-state');
const vinculos = require('./telegram-vinculos');
const { construirPrompt } = require('./prompt-builder');
const { invocarClaudeJSONConConsultas } = require('./claude-client');
const { transcribirBuffer } = require('./transcribir');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const API = `https://api.telegram.org/bot${TOKEN}`;
const POLL_TIMEOUT_S = 45;
const WA_DOWN_UMBRAL_MS = Number(process.env.TG_WA_DOWN_UMBRAL_MS || 10 * 60 * 1000);

// estado en disco (sobrevive restarts): offset del polling + aviso wa-down
const _stateDir = process.env.MARIA_DB ? path.dirname(path.dirname(process.env.MARIA_DB)) : '.';
const OFFSET_F  = path.join(_stateDir, 'tg-offset');
const WADOWN_F  = path.join(_stateDir, 'tg-wa-down');

let _detenido = false;

async function _api(metodo, params = {}) {
  const res = await fetch(`${API}/${metodo}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const j = await res.json().catch(() => null);
  if (!j || !j.ok) throw new Error(`telegram ${metodo}: ${j ? JSON.stringify(j).slice(0, 200) : res.status}`);
  return j.result;
}

async function enviarTG(chatId, texto, extra = {}) {
  // Telegram capea 4096 chars por mensaje
  const partes = [];
  let t = String(texto || '');
  while (t.length > 0) { partes.push(t.slice(0, 4000)); t = t.slice(4000); }
  for (let i = 0; i < partes.length; i++) {
    // el reply_markup va solo en el último mensaje
    await _api('sendMessage', { chat_id: chatId, text: partes[i], ...(i === partes.length - 1 ? extra : {}) });
  }
}

// ── Audio/voz → texto (2026-07-06, pedido de Diego) ────────────────────────
// Reusa el mismo whisper.cpp local que WhatsApp (transcribir.js). Solo para
// usuarios vinculados: es canal de respaldo, no gastamos CPU en desconocidos.
const TG_AUDIO_MAX_BYTES = 20 * 1024 * 1024; // límite de getFile en la Bot API

async function _transcribirAudioTG(msg) {
  const a = msg.voice || msg.audio;
  if ((a.file_size || 0) > TG_AUDIO_MAX_BYTES) throw new Error('audio supera 20MB (límite Bot API)');
  const f = await _api('getFile', { file_id: a.file_id });
  if (!f.file_path) throw new Error('getFile sin file_path');
  const res = await fetch(`https://api.telegram.org/file/bot${TOKEN}/${f.file_path}`);
  if (!res.ok) throw new Error(`descarga de audio: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const mime = a.mime_type || '';
  const ext = mime.includes('mpeg') ? 'mp3' : mime.includes('mp4') ? 'm4a' : 'ogg';
  return await transcribirBuffer(buf, ext);
}

const _KB_COMPARTIR = { reply_markup: { keyboard: [[{ text: '📱 Compartir mi número', request_contact: true }]], resize_keyboard: true, one_time_keyboard: true } };
const _KB_QUITAR = { reply_markup: { remove_keyboard: true } };

// Vinculación por teléfono compartido (2026-07-03, pedido de Diego: un tap en
// vez de código). Telegram verifica el número de la cuenta; solo aceptamos el
// contact del PROPIO remitente (contact.user_id === from.id — si no, alguien
// podría mandar el contacto de otro). Match contra wa_cus con la lógica de
// resolverPorWa (banca la variante 9-móvil AR).
async function _vincularPorContacto(msg) {
  const chatId = String(msg.chat.id);
  const c = msg.contact;
  if (!c || !c.phone_number) return;
  if (!c.user_id || String(c.user_id) !== String(msg.from?.id)) {
    await enviarTG(chatId, 'Ese contacto no es el tuyo — tocá el botón "📱 Compartir mi número" para mandar el de tu propia cuenta.', _KB_COMPARTIR);
    return;
  }
  const digitos = String(c.phone_number).replace(/\D/g, '');
  const u = digitos.length >= 8 ? usuarios.resolverPorWa(`${digitos}@c.us`) : null;
  if (!u) {
    await enviarTG(chatId, 'No encontré ese número entre los usuarios de Maria (¿tu Telegram usa otro número que tu WhatsApp?). Pedile a Maria por WhatsApp "quiero vincular telegram" y mandame acá el código de 6 dígitos que te dé.', _KB_QUITAR);
    return;
  }
  usuarios.setTelegramChatId(u.id, chatId);
  console.log(`[TG] vinculado por teléfono: ${u.nombre} (id=${u.id}) ↔ chat ${chatId}`);
  mem.log({ usuarioId: u.id, canal: 'sistema', direccion: 'interno',
    cuerpo: `telegram vinculado por teléfono compartido (chat ${chatId})`, metadata: { tipo: 'tg_vinculo', chatId, via: 'contact' } });
  await enviarTG(chatId, `✅ Listo, ${u.nombre} — quedamos conectados también por acá.\n\nEste canal es de respaldo: si WhatsApp se cae, te aviso y seguimos por acá. Igual me podés escribir cuando quieras.`, _KB_QUITAR);
}

function _leerOffset() {
  try { return Number(fs.readFileSync(OFFSET_F, 'utf8').trim()) || 0; } catch { return 0; }
}
function _guardarOffset(o) {
  try { fs.writeFileSync(OFFSET_F, String(o)); } catch {}
}

// ── Turno de usuario vinculado: pipeline completo ─────────────────────────
async function _procesarTurno(usuario, chatId, texto) {
  const startTs = Date.now();
  const chatKey = 'telegram:' + chatId;
  turnState.setLastInbound(chatKey, startTs);

  const rl = seguridad.verificarRateLimit({ usuarioId: usuario.id });
  if (!rl.ok) {
    await enviarTG(chatId, `⏳ vas muy rápido — esperá ${Math.ceil(rl.retry_in_ms / 1000)}s`);
    return;
  }
  const motivoInj = seguridad.detectarInjection(texto);
  if (motivoInj) {
    mem.logSecurityEvent({ usuarioId: usuario.id, canal: 'telegram',
      motivo: `injection_attempt: ${motivoInj}`, body: texto, extra: { chatId } });
    // no bloquea (telemetría, mismo criterio que WA)
  }

  const entrada = { de: chatKey, nombre: usuario.nombre, cuerpo: texto };
  mem.log({ usuarioId: usuario.id, canal: 'telegram', direccion: 'entrante',
    de: chatKey, nombre: usuario.nombre, cuerpo: texto });

  const prompt = await construirPrompt({ usuario, canal: 'telegram', entrada });
  let json;
  try {
    ({ json } = await invocarClaudeJSONConConsultas(prompt, { usuario }, {
      audit: { usuarioId: usuario.id, canal: 'telegram', chatKey, turnStartTs: startTs, turnoTercero: false },
      sesion: 'off',
    }));
  } catch (err) {
    console.error(`[TG/${usuario.nombre}] Claude falló:`, err.message);
    mem.log({ usuarioId: usuario.id, canal: 'sistema', direccion: 'interno',
      cuerpo: `Claude falló en telegram (${usuario.nombre}): ${err.message}` });
    return;
  }

  // En TG el remitente ES el usuario: mergeamos slots si el modelo separó.
  let respuesta = [json?.respuesta_a_usuario, json?.respuesta_a_remitente, (!json?.respuesta_a_usuario && !json?.respuesta_a_remitente) ? json?.respuesta : '']
    .filter(s => s && String(s).trim()).join('\n\n');

  // Backstop determinista (mismo criterio que WA): si una acción visible
  // falló en vivo, no confirmar en silencio — anexar aviso honesto simple.
  const resTurno = turnState.takeTurnResults(chatKey, startTs);
  const fallas = resTurno.filter(r => !r.ok && !r.stale);
  if (fallas.length) {
    const detalle = fallas.map(r => r.accion?.tipo || '?').join(', ');
    respuesta = (respuesta ? respuesta + '\n\n' : '') + `⚠️ Ojo: no pude completar ${fallas.length === 1 ? 'esta acción' : 'estas acciones'}: ${detalle}.`;
  }

  if (respuesta && respuesta.trim()) {
    await enviarTG(chatId, respuesta);
    mem.log({ usuarioId: usuario.id, canal: 'telegram', direccion: 'saliente',
      de: chatKey, nombre: usuario.nombre, cuerpo: respuesta });
  }
}

// ── Mensajes de chats no vinculados ────────────────────────────────────────
const _avisadosNoVinculados = new Map(); // chatId -> ts último aviso (anti-spam 1h)
async function _procesarNoVinculado(chatId, texto) {
  const codigo = String(texto || '').trim();
  if (/^\d{6}$/.test(codigo)) {
    const usuarioId = vinculos.consumir(codigo);
    if (usuarioId) {
      const u = usuarios.setTelegramChatId(usuarioId, chatId);
      console.log(`[TG] vinculado: ${u.nombre} (id=${u.id}) ↔ chat ${chatId}`);
      mem.log({ usuarioId, canal: 'sistema', direccion: 'interno',
        cuerpo: `telegram vinculado (chat ${chatId})`, metadata: { tipo: 'tg_vinculo', chatId } });
      await enviarTG(chatId, `✅ Listo, ${u.nombre} — quedamos conectados también por acá.\n\nEste canal es de respaldo: si WhatsApp se cae, te aviso y seguimos por acá. Igual me podés escribir cuando quieras.`, _KB_QUITAR);
      return;
    }
    await enviarTG(chatId, 'Ese código no es válido o expiró. Pedime uno nuevo por WhatsApp ("quiero vincular telegram") y mandámelo acá en menos de 15 minutos.');
    return;
  }
  const ultimo = _avisadosNoVinculados.get(chatId) || 0;
  if (Date.now() - ultimo > 3600_000) {
    _avisadosNoVinculados.set(chatId, Date.now());
    await enviarTG(chatId, 'Hola 👋 Este es el canal de respaldo de Maria para sus usuarios.\n\nSi sos usuario, tocá el botón de acá abajo y quedamos vinculados al toque (tiene que ser el mismo número que usás en WhatsApp). Si tu Telegram usa otro número, pedile a Maria por WhatsApp "quiero vincular telegram" y mandame el código.', _KB_COMPARTIR);
  }
}

// ── Detección de WhatsApp caído + broadcast ────────────────────────────────
async function _chequearWaDown(waEstado) {
  try {
    if (waEstado.ready) {
      if (fs.existsSync(WADOWN_F)) {
        const contenido = fs.readFileSync(WADOWN_F, 'utf8');
        fs.unlinkSync(WADOWN_F);
        if (contenido.includes('avisado')) {
          await _broadcast('✅ WhatsApp volvió — seguimos por el canal de siempre. Gracias por la paciencia.');
        }
      }
      return;
    }
    // WA no está ready
    if (!fs.existsSync(WADOWN_F)) {
      fs.writeFileSync(WADOWN_F, String(Date.now()));
      return;
    }
    const contenido = fs.readFileSync(WADOWN_F, 'utf8');
    if (contenido.includes('avisado')) return;
    const desde = Number(contenido.trim()) || Date.now();
    if (Date.now() - desde > WA_DOWN_UMBRAL_MS) {
      fs.writeFileSync(WADOWN_F, `${desde} avisado`);
      await _broadcast('⚠️ Se me cayó WhatsApp (estamos trabajando para recuperarlo). Mientras tanto seguime escribiendo por acá — funciono igual.');
    }
  } catch (e) { console.warn('[TG] chequeo wa-down:', e.message); }
}

async function _broadcast(texto) {
  const vinculados = usuarios.listarActivos().filter(u => u.telegram_chat_id);
  console.log(`[TG] broadcast a ${vinculados.length} vinculado(s): ${texto.slice(0, 60)}`);
  for (const u of vinculados) {
    try {
      await enviarTG(u.telegram_chat_id, texto);
      mem.log({ usuarioId: u.id, canal: 'telegram', direccion: 'saliente',
        de: 'telegram:' + u.telegram_chat_id, nombre: u.nombre, cuerpo: texto,
        metadata: { tipo: 'tg_broadcast' } });
    } catch (e) { console.warn(`[TG] broadcast a ${u.nombre} falló:`, e.message); }
  }
}

// ── Loop principal (long polling encadenado, sin solapes) ──────────────────
async function _loop(waEstado) {
  let offset = _leerOffset();
  while (!_detenido) {
    try {
      await _chequearWaDown(waEstado);
      const updates = await _api('getUpdates', { offset: offset + 1, timeout: POLL_TIMEOUT_S, allowed_updates: ['message'] });
      for (const up of updates) {
        offset = Math.max(offset, up.update_id);
        _guardarOffset(offset);
        const msg = up.message;
        if (!msg || !msg.chat || msg.chat.type !== 'private') continue; // solo DMs
        const chatId = String(msg.chat.id);
        if (msg.contact && !usuarios.obtenerPorTelegram(chatId)) {
          try { await _vincularPorContacto(msg); } catch (e) { console.error('[TG] vincular por contacto:', e.message); }
          continue;
        }
        let texto = msg.text || msg.caption || '';
        const u = usuarios.obtenerPorTelegram(chatId);
        if (!texto.trim() && u && (msg.voice || msg.audio)) {
          try {
            console.log('[TG] transcribiendo audio…');
            texto = await _transcribirAudioTG(msg);
            console.log(`[TG audio→texto] ${String(texto).slice(0, 160)}`);
          } catch (e) {
            console.error('[TG] transcripción falló:', e.message);
            mem.log({ usuarioId: u.id, canal: 'telegram', direccion: 'entrante',
              de: 'telegram:' + chatId, nombre: u.nombre,
              cuerpo: `transcripción TG falló: ${e.message}`,
              metadata: { tipo: 'tg_audio_fallido' } });
            try { await enviarTG(chatId, '(no pude transcribir tu audio — mandámelo en texto)'); } catch {}
            continue;
          }
        }
        if (!texto.trim()) continue; // otros media (foto/video/doc) siguen ignorados
        try {
          if (u) await _procesarTurno(u, chatId, texto);
          else await _procesarNoVinculado(chatId, texto);
        } catch (e) {
          console.error(`[TG] procesando chat ${chatId}:`, e.message);
        }
      }
    } catch (err) {
      console.warn('[TG] poll error (reintento en 15s):', err.message);
      await new Promise(r => setTimeout(r, 15_000));
    }
  }
}

function iniciarTelegram({ waEstado } = {}) {
  if (!TOKEN) {
    console.log('[TG] TELEGRAM_BOT_TOKEN no seteado — canal de respaldo APAGADO');
    return null;
  }
  console.log('▸ arrancando telegram-handler (canal de respaldo, long polling)');
  _loop(waEstado || { ready: false }).catch(e => console.error('[TG] loop murió:', e.message));
  return { detener: () => { _detenido = true; } };
}

module.exports = { iniciarTelegram, enviarTG };
