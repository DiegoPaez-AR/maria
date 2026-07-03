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

async function enviarTG(chatId, texto) {
  // Telegram capea 4096 chars por mensaje
  const partes = [];
  let t = String(texto || '');
  while (t.length > 0) { partes.push(t.slice(0, 4000)); t = t.slice(4000); }
  for (const p of partes) await _api('sendMessage', { chat_id: chatId, text: p });
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
      await enviarTG(chatId, `✅ Listo, ${u.nombre} — quedamos conectados también por acá.\n\nEste canal es de respaldo: si WhatsApp se cae, te aviso y seguimos por acá. Igual me podés escribir cuando quieras.`);
      return;
    }
    await enviarTG(chatId, 'Ese código no es válido o expiró. Pedime uno nuevo por WhatsApp ("quiero vincular telegram") y mandámelo acá en menos de 15 minutos.');
    return;
  }
  const ultimo = _avisadosNoVinculados.get(chatId) || 0;
  if (Date.now() - ultimo > 3600_000) {
    _avisadosNoVinculados.set(chatId, Date.now());
    await enviarTG(chatId, 'Hola 👋 Este es el canal de respaldo de Maria para sus usuarios. Si sos usuario, pedile a Maria por WhatsApp "quiero vincular telegram" y mandame acá el código de 6 dígitos que te dé.');
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
    try { await enviarTG(u.telegram_chat_id, texto); }
    catch (e) { console.warn(`[TG] broadcast a ${u.nombre} falló:`, e.message); }
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
        const texto = msg.text || msg.caption || '';
        if (!texto.trim()) continue; // v1: solo texto
        const u = usuarios.obtenerPorTelegram(chatId);
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
