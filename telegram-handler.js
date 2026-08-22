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
const { construirPrompt, construirTurnoSesion } = require('./prompt-builder');
const { invocarClaudeJSONConConsultas, invocarClaudeJSON } = require('./claude-client');
const gestionAjena = require('./gestion-ajena');
const sesiones = require('./session-manager');

// Turnos en curso por chat (auditoría #11): serializa por conversación sin
// bloquear el polling ni a los demás chats.
const _enCursoTG = new Map();
const loopGuard = require('./loop-guard');
const { transcribirBuffer } = require('./transcribir');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const API = `https://api.telegram.org/bot${TOKEN}`;
const POLL_TIMEOUT_S = 45;

// estado en disco (sobrevive restarts): offset del polling + aviso wa-down
const _stateDir = process.env.MARIA_DB ? path.dirname(path.dirname(process.env.MARIA_DB)) : '.';
const OFFSET_F  = path.join(_stateDir, 'tg-offset');

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
const TG_FILE_MAX_BYTES = 20 * 1024 * 1024; // límite de getFile en la Bot API (audio y adjuntos)

async function _transcribirAudioTG(msg) {
  // 2026-08-05: también video y video_note (los "redondos") — ffmpeg extrae
  // el audio del mp4 en el mismo pipeline; se transcribe solo el audio.
  const a = msg.voice || msg.audio || msg.video_note || msg.video;
  if ((a.file_size || 0) > TG_FILE_MAX_BYTES) throw new Error('audio/video supera 20MB (límite Bot API)');
  const f = await _api('getFile', { file_id: a.file_id });
  if (!f.file_path) throw new Error('getFile sin file_path');
  const res = await fetch(`https://api.telegram.org/file/bot${TOKEN}/${f.file_path}`);
  if (!res.ok) throw new Error(`descarga de audio: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const esVideo = !!(msg.video_note || msg.video);
  const mime = a.mime_type || '';
  const ext = esVideo ? 'mp4' : mime.includes('mpeg') ? 'mp3' : mime.includes('mp4') ? 'm4a' : 'ogg';
  const t = await transcribirBuffer(buf, ext);
  return esVideo ? `(video — transcripción del audio): ${t}` : t;
}

// ── Archivos de texto plano (.txt/.csv/.md) → contenido inline (2026-08-05) ──
const TG_TEXTO_MAX_CHARS = Number(process.env.TG_TEXTO_MAX_CHARS || 50_000);
function _esDocTexto(d) {
  const mime = d.mime_type || '';
  const nombre = d.file_name || '';
  return /^text\//i.test(mime) || /\.(txt|csv|md|log|tsv)$/i.test(nombre);
}
async function _leerDocTextoTG(msg) {
  const d = msg.document;
  if ((d.file_size || 0) > 512 * 1024) throw new Error('archivo de texto supera 512KB');
  const f = await _api('getFile', { file_id: d.file_id });
  const res = await fetch(`https://api.telegram.org/file/bot${TOKEN}/${f.file_path}`);
  if (!res.ok) throw new Error(`descarga: HTTP ${res.status}`);
  const contenido = Buffer.from(await res.arrayBuffer()).toString('utf8');
  const truncado = contenido.length > TG_TEXTO_MAX_CHARS;
  return { nombre: d.file_name || 'archivo.txt', contenido: contenido.slice(0, TG_TEXTO_MAX_CHARS), truncado };
}

// Foto / documento (imagen o PDF) → /tmp para visión multimodal, igual que
// WA (prompt-builder ya banca entrada.attachmentPath en cualquier canal).
async function _descargarAdjuntoTG(msg) {
  let fileId = null, mime = '', nombre = null, size = 0, desc = 'archivo';
  if (msg.photo && msg.photo.length) {
    const p = msg.photo[msg.photo.length - 1]; // última = mayor resolución
    fileId = p.file_id; size = p.file_size || 0; mime = 'image/jpeg'; desc = 'foto';
  } else if (msg.document) {
    const d = msg.document;
    mime = d.mime_type || '';
    if (!/^image\//i.test(mime) && !/^application\/pdf$/i.test(mime)) return null;
    fileId = d.file_id; size = d.file_size || 0; nombre = d.file_name || null;
    desc = nombre || (/pdf/i.test(mime) ? 'PDF' : 'imagen');
  }
  if (!fileId) return null;
  if (size > TG_FILE_MAX_BYTES) throw new Error('adjunto supera 20MB (límite Bot API)');
  const f = await _api('getFile', { file_id: fileId });
  if (!f.file_path) throw new Error('getFile sin file_path');
  const res = await fetch(`https://api.telegram.org/file/bot${TOKEN}/${f.file_path}`);
  if (!res.ok) throw new Error(`descarga de adjunto: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  let ext = nombre && /\.[a-z0-9]+$/i.test(nombre) ? nombre.match(/\.[a-z0-9]+$/i)[0]
          : /pdf/i.test(mime)  ? '.pdf'
          : /png/i.test(mime)  ? '.png'
          : /webp/i.test(mime) ? '.webp'
          : '.jpg';
  const tmpPath = path.join('/tmp', `maria-attach-tg-${Date.now()}-${Math.random().toString(16).slice(2, 8)}${ext}`);
  fs.writeFileSync(tmpPath, buf);
  console.log(`[TG] adjunto → ${tmpPath} (${Math.round(buf.length / 1024)} KB)`);
  return { path: tmpPath, desc };
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
async function _procesarTurno(usuario, chatId, texto, attachmentPath = null) {
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

  const entrada = { de: chatKey, nombre: usuario.nombre, cuerpo: texto, ...(attachmentPath ? { attachmentPath } : {}) };
  mem.log({ usuarioId: usuario.id, canal: 'telegram', direccion: 'entrante',
    de: chatKey, nombre: usuario.nombre, cuerpo: texto });

  const prompt = await construirPrompt({ usuario, canal: 'telegram', entrada });
  // ─── Sesiones persistentes (MARIA_SESIONES=1, default APAGADO) ──────────
  // Cableado 2026-08-22. Telegram es el canal principal de los usuarios desde
  // la política v5, y era el único que seguía re-mandando el system entero
  // (~64k chars) en CADA turno. Mismo patrón que gmail-handler: con sesión
  // viva mandamos solo el turno compacto y la API relee del prompt cache.
  // Los turnos de TERCEROS (más abajo) siguen sessionless a propósito:
  // no se mezclan interlocutores en la historia lineal del usuario.
  const auditTG = { usuarioId: usuario.id, canal: 'telegram', chatKey, turnStartTs: startTs, turnoTercero: false };
  const SESIONES_ON = sesiones.habilitado(usuario)
    && prompt && typeof prompt === 'object' && !!prompt.system;
  let json;
  try {
    if (!SESIONES_ON) {
      ({ json } = await invocarClaudeJSONConConsultas(prompt, { usuario }, { audit: auditTG, sesion: 'off' }));
    } else {
      // Mutex por usuario: Telegram y Gmail comparten la sesión del usuario.
      json = await sesiones.lockUsuario(usuario.id, async () => {
        const hash = sesiones.promptHashDe(prompt.system);
        let ses = sesiones.getSesion(usuario.id);
        if (ses && sesiones.debeRotar(ses, hash)) {
          console.log(`[TG sesion/${usuario.nombre}] rotando sesión (turnos=${ses.turnos}, creada=${ses.creada})`);
          sesiones.resetSesion(usuario.id);
          ses = null;
        }
        const turnoInicial = async () => {
          const r = await invocarClaudeJSONConConsultas(prompt, { usuario }, { audit: auditTG, sesion: 'nueva', sesionTurno: 1 });
          if (r.sessionId) {
            sesiones.guardarSesion(usuario.id, { id: r.sessionId, turnos: 1, creada: new Date().toISOString(), promptHash: hash });
          }
          return r.json;
        };
        if (!ses) return await turnoInicial();
        const turno = await construirTurnoSesion({ usuario, canal: 'telegram', entrada });
        try {
          const r = await invocarClaudeJSONConConsultas(turno, { usuario }, {
            audit: auditTG, resumeId: ses.id, sesion: 'resume', sesionTurno: ses.turnos + 1,
          });
          sesiones.guardarSesion(usuario.id, { ...ses, id: r.sessionId || ses.id, turnos: ses.turnos + 1 });
          return r.json;
        } catch (err) {
          if (err.codigo !== 'RESUME_FALLIDO') throw err;
          console.warn(`[TG sesion/${usuario.nombre}] resume falló (${err.message}) — roto sesión y reintento con prompt completo`);
          sesiones.resetSesion(usuario.id);
          return await turnoInicial();
        }
      });
    }
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
    await enviarTG(chatId, respuesta);
    mem.log({ usuarioId: usuario.id, canal: 'telegram', direccion: 'saliente',
      de: chatKey, nombre: usuario.nombre, cuerpo: respuesta });
  }
}

// ── Terceros por Telegram (2026-07-07, pedido Diego) ───────────────────────
// Un no-vinculado puede ser un TERCERO con quien Maria coordina (le llegó el
// link t.me por la firma de email). Pre-pass LLM barato decide si el mensaje
// encaja con alguna gestión abierta; si sí, el turno corre por el pipeline
// del usuario correspondiente con marca de tercero. Bot API no permite
// iniciar chats: esto cubre SOLO el sentido tercero→Maria.
const _prepassPorChat = new Map(); // chatId -> { ts último, cuentaDia, dia }
const PREPASS_MIN_MS = 60_000;
const PREPASS_MAX_DIA = 10;

function _prepassPermitido(chatId) {
  const hoy = new Date().toISOString().slice(0, 10);
  const e = _prepassPorChat.get(chatId) || { ts: 0, cuenta: 0, dia: hoy };
  if (e.dia !== hoy) { e.cuenta = 0; e.dia = hoy; }
  if (Date.now() - e.ts < PREPASS_MIN_MS || e.cuenta >= PREPASS_MAX_DIA) return false;
  e.ts = Date.now(); e.cuenta++;
  _prepassPorChat.set(chatId, e);
  return true;
}

async function _prepassTercero(chatId, remitente, texto) {
  if (!_prepassPermitido(chatId)) return null;
  const activos = usuarios.listarActivos();
  const lineasPend = [];
  for (const u of activos) {
    let pends = [];
    try { pends = mem.listarPendientes(u.id); } catch {}
    for (const p of pends) {
      if (p.disparador === 'trigger_externo' && p.estado === 'abierto') {
        lineasPend.push(`- usuario_id=${u.id} (${u.nombre}): "${String(p.desc).slice(0, 160)}"`);
      }
    }
  }
  const nombreTG = [remitente?.first_name, remitente?.last_name].filter(Boolean).join(' ') || '(sin nombre)';
  const userTG = remitente?.username ? '@' + remitente.username : '(sin username)';
  const prompt = [
    `Sos el clasificador de remitentes desconocidos del bot de Telegram de ${process.env.ASISTENTE_NOMBRE || 'Maria'} (asistente ejecutiva).`,
    `Alguien que NO es usuario vinculado escribió al bot. Puede ser: (a) un tercero con quien Maria está coordinando algo a pedido de un usuario (le llegó el link del bot por email), (b) uno de los usuarios activos que todavía no se vinculó, o (c) alguien sin relación.`,
    ``,
    `Remitente Telegram: nombre "${nombreTG}", username ${userTG}.`,
    `Mensaje: """${String(texto).slice(0, 800)}"""`,
    ``,
    `Usuarios activos: ${activos.map(u => `id=${u.id} ${u.nombre}`).join(' · ') || '(ninguno)'}`,
    `Gestiones abiertas esperando respuesta de un tercero:`,
    lineasPend.length ? lineasPend.join('\n') : '(ninguna)',
    ``,
    `Respondé SOLO un JSON:`,
    `{"tipo":"tercero_de_usuario","usuario_id":<id>,"razon":"<por qué encaja, 1 frase>"} — si el mensaje o la identidad del remitente encaja CLARAMENTE con una gestión abierta o con algo que dice venir a coordinar con un usuario concreto.`,
    `{"tipo":"posible_usuario"} — si el remitente parece SER uno de los usuarios activos.`,
    `{"tipo":"desconocido"} — sin señal clara. ANTE LA DUDA, "desconocido". No adivines.`,
  ].join('\n');
  try {
    const { json } = await invocarClaudeJSON(prompt, { timeoutMs: 60_000, audit: { usuarioId: null, canal: 'tg-prepass' } });
    if (json && json.tipo === 'tercero_de_usuario' && json.usuario_id) {
      const u = usuarios.obtener(Number(json.usuario_id));
      if (u) return { tipo: 'tercero_de_usuario', usuario: u, razon: json.razon || null };
      return null;
    }
    return json || null;
  } catch (e) {
    console.warn('[TG] pre-pass tercero falló:', e.message);
    return null;
  }
}

async function _procesarTurnoTercero(usuario, chatId, remitente, texto, razon) {
  const startTs = Date.now();
  const chatKey = 'telegram:' + chatId;
  turnState.setLastInbound(chatKey, startTs);
  const nombreTG = [remitente?.first_name, remitente?.last_name].filter(Boolean).join(' ') || chatKey;

  const rl = seguridad.verificarRateLimit({ usuarioId: usuario.id });
  if (!rl.ok) return;
  const motivoInj = seguridad.detectarInjection(texto);
  if (motivoInj) {
    mem.logSecurityEvent({ usuarioId: usuario.id, canal: 'telegram',
      motivo: `injection_attempt (tercero): ${motivoInj}`, body: texto, extra: { chatId } });
  }

  mem.log({ usuarioId: usuario.id, canal: 'telegram', direccion: 'entrante',
    de: chatKey, nombre: nombreTG, cuerpo: texto,
    metadata: { tipo: 'tg_tercero', razon, chatId } });

  const entrada = { de: chatKey, nombre: nombreTG, cuerpo: texto,
    contextoRemitente: { esTercero: true, razon, via: 'llm', identificadoComo: 'tercero_de_usuario' } };
  const prompt = await construirPrompt({ usuario, canal: 'telegram', entrada });
  let json;
  try {
    ({ json } = await invocarClaudeJSONConConsultas(prompt, { usuario }, {
      audit: { usuarioId: usuario.id, canal: 'telegram', chatKey, turnStartTs: startTs, turnoTercero: true },
      sesion: 'off',
    }));
  } catch (err) {
    console.error(`[TG/tercero→${usuario.nombre}] Claude falló:`, err.message);
    return;
  }

  const alTercero = (json?.respuesta_a_remitente || '').trim();
  const alUsuario = (json?.respuesta_a_usuario || '').trim();
  if (alTercero) {
    await enviarTG(chatId, alTercero);
    mem.log({ usuarioId: usuario.id, canal: 'telegram', direccion: 'saliente',
      de: chatKey, nombre: nombreTG, cuerpo: alTercero, metadata: { tipo: 'tg_tercero_respuesta' } });
  }
  if (alUsuario) {
    try {
      const waSend = require('./wa-send'); // lazy: evita ciclos
      await waSend.enviarWAUsuario(null, usuario, alUsuario, { tag: `tg-tercero/${usuario.nombre}` });
    } catch (e) {
      console.warn(`[TG/tercero] no pude avisar a ${usuario.nombre}:`, e.message);
    }
  }
  console.log(`[TG] turno tercero (${nombreTG}) en contexto de ${usuario.nombre} — razón: ${razon || 's/d'}`);
}

// ── Mensajes de chats no vinculados ────────────────────────────────────────
const _avisadosNoVinculados = new Map(); // chatId -> ts último aviso (anti-spam 1h)
async function _procesarNoVinculado(chatId, texto, remitente = null) {
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
  // ── Fase 3 identidad (2026-08-17): lookup DETERMINÍSTICO por username de
  // Telegram en las libretas ANTES del pre-pass LLM. Si el contacto está
  // cargado con su telegram, rutea directo como tercero del dueño (candado
  // de homónimos si aparece en varias libretas, igual que WA).
  const userTG = String(remitente?.username || '').trim().toLowerCase();
  if (userTG) {
    const rows = mem.db.prepare(
      `SELECT usuario_id, nombre FROM contactos WHERE lower(COALESCE(telegram,'')) = ?`
    ).all(userTG);
    const porU = new Map();
    for (const r of rows) if (!porU.has(r.usuario_id)) porU.set(r.usuario_id, r);
    if (porU.size === 1) {
      const c = [...porU.values()][0];
      const due = usuarios.obtener(c.usuario_id);
      if (due) {
        mem.log({ usuarioId: due.id, canal: 'sistema', direccion: 'interno',
          cuerpo: `TG: @${userTG} matchea contacto "${c.nombre}" en libreta de ${due.nombre} — ruteo directo como tercero`,
          metadata: { tipo: 'tg_tercero_por_libreta', chatId } });
        await _procesarTurnoTercero(due, chatId, remitente, texto, `contacto @${userTG} (${c.nombre}) en la libreta`);
        return;
      }
    } else if (porU.size > 1) {
      mem.log({ canal: 'sistema', direccion: 'interno',
        cuerpo: `TG: @${userTG} en ${porU.size} libretas — no ruteo (candado homónimos), sigue pre-pass`,
        metadata: { tipo: 'tg_tercero_ambiguo', chatId } });
    }
  }

  // ¿Tercero de una gestión abierta? (2026-07-07)
  const decision = await _prepassTercero(chatId, remitente, texto);
  if (decision && decision.tipo === 'tercero_de_usuario' && decision.usuario) {
    await _procesarTurnoTercero(decision.usuario, chatId, remitente, texto, decision.razon);
    return;
  }

  const ultimo = _avisadosNoVinculados.get(chatId) || 0;
  if (Date.now() - ultimo > 3600_000) {
    _avisadosNoVinculados.set(chatId, Date.now());
    const NOMBRE = process.env.ASISTENTE_NOMBRE || 'Maria';
    await enviarTG(chatId, `Hola 👋 Soy ${NOMBRE}, asistente.\n\n· Si sos usuario mío, tocá el botón de acá abajo y quedamos vinculados al toque (mismo número que usás en WhatsApp). Si tu Telegram usa otro número, pedime el código por WhatsApp ("quiero vincular telegram") y mandámelo acá.\n\n· Si venís a coordinar algo con alguno de mis usuarios, contame quién sos y de qué se trata, y sigo yo.`, _KB_COMPARTIR);
  }
}

// Detección de "WhatsApp caído" + broadcast: ELIMINADA 2026-08-22 con la
// jubilación de whatsapp-web.js. Ya no hay un `ready` que mirar, y con la
// política v5 los usuarios no dependen de WhatsApp (van por Telegram/email).
// La salud del canal la vigila wa-hook-watchdog: si el teléfono deja de dar
// señales, avisa AL OWNER (no a todos). _broadcast se conserva: lo usan otros
// avisos generales.

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
async function _loop() {
  let offset = _leerOffset();
  while (!_detenido) {
    try {
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
        // Contacto compartido por un VINCULADO (2026-08-05, pedido Diego —
        // antes se descartaba en silencio: msg.contact solo se usaba para la
        // vinculación de no-vinculados). Entra como turno de texto → el modelo
        // lo guarda con upsert_contacto, que trae el guard anti-duplicados.
        if (u && msg.contact && !texto.trim()) {
          const c = msg.contact;
          const nombreC = [c.first_name, c.last_name].filter(Boolean).join(' ');
          texto = `[CONTACTO COMPARTIDO] ${nombreC || '(sin nombre)'} — tel: ${c.phone_number || '(sin número)'}` +
            (c.vcard ? `\n(vCard: ${String(c.vcard).replace(/\s+/g, ' ').slice(0, 400)})` : '') +
            `\n(El usuario te compartió este contacto por Telegram — guardalo en su libreta con upsert_contacto salvo que el contexto diga otra cosa.)`;
          console.log(`[TG] contacto compartido por ${u.nombre}: ${nombreC} ${c.phone_number || ''}`);
        }
        // Ubicación / venue compartida (2026-08-05)
        if (u && (msg.location || msg.venue) && !texto.trim()) {
          const v = msg.venue;
          const l = (v && v.location) || msg.location;
          texto = `[UBICACIÓN COMPARTIDA]${v ? ` ${v.title}${v.address ? ' — ' + v.address : ''}` : ''} (https://maps.google.com/?q=${l.latitude},${l.longitude})` +
            `\n(El usuario te compartió esta ubicación por Telegram — usala según el contexto: dirección de un contacto, lugar de un evento, etc.)`;
          console.log(`[TG] ubicación compartida por ${u.nombre}`);
        }
        // Archivo de texto plano (.txt/.csv/.md) → contenido inline (2026-08-05)
        if (u && msg.document && _esDocTexto(msg.document) && !texto.trim()) {
          try {
            const doc = await _leerDocTextoTG(msg);
            texto = `${msg.caption ? msg.caption + '\n' : ''}[ARCHIVO ${doc.nombre}]\n${doc.contenido}${doc.truncado ? '\n(…archivo truncado a ' + TG_TEXTO_MAX_CHARS + ' caracteres)' : ''}`;
            console.log(`[TG] archivo de texto de ${u.nombre}: ${doc.nombre} (${doc.contenido.length} chars)`);
          } catch (e) {
            console.warn('[TG] archivo de texto falló:', e.message);
            try { await enviarTG(chatId, `(no pude leer tu archivo: ${e.message})`); } catch {}
            continue;
          }
        }
        if (!texto.trim() && u && (msg.voice || msg.audio || msg.video_note || msg.video)) {
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
        let adjunto = null;
        if (u && (msg.photo || msg.document)) {
          try {
            adjunto = await _descargarAdjuntoTG(msg);
            if (adjunto && !texto.trim()) texto = `(adjuntó ${adjunto.desc})`;
          } catch (e) {
            console.warn('[TG] descarga de adjunto falló:', e.message);
          }
        }
        if (!texto.trim()) continue; // resto de media (video/otros docs) sigue ignorado
        // Cola POR CHAT (auditoría 22/8 #11): antes el await estaba dentro del
        // loop de polling → un turno lento (hasta 480s) dejaba al canal
        // PRINCIPAL sin atender a nadie y sin pedir updates. Ahora cada chat
        // se serializa contra sí mismo y los demás siguen.
        const _prev = _enCursoTG.get(chatId) || Promise.resolve();
        const _tarea = _prev.catch(() => {}).then(async () => {
        try {
          if (u) {
            // Ruteo por identidad (Fase 1, 2026-08-16): si este usuario tiene
            // gestiones ABIERTAS de OTROS usuarios esperándolo (por su WA o su
            // email — la conversación sigue a la persona, no al canal), y el
            // clasificador dice que este mensaje las responde → turno de
            // TERCERO del dueño. Duda/error → turno propio (fail-open).
            let ga = null;
            try { ga = await gestionAjena.gestionAjenaRelacionada(u, texto, { canal: 'telegram' }); }
            catch (e) { console.warn('[TG] gestion-ajena falló (sigo como usuario):', e.message); }
            if (ga) await _procesarTurnoTercero(ga.due, chatId, msg.from || { first_name: u.nombre }, texto, `usuario ${u.nombre} respondiendo gestión ajena #${ga.gestion}`);
            else await _procesarTurno(u, chatId, texto, adjunto ? adjunto.path : null);
          }
          else await _procesarNoVinculado(chatId, texto, msg.from || null);
        } catch (e) {
          console.error(`[TG] procesando chat ${chatId}:`, e.message);
        } finally {
          if (adjunto) { try { fs.unlinkSync(adjunto.path); } catch {} }
        }
        });
        _enCursoTG.set(chatId, _tarea);
        _tarea.finally(() => { if (_enCursoTG.get(chatId) === _tarea) _enCursoTG.delete(chatId); });
      }
      loopGuard.reportar('telegram_polling', true);
    } catch (err) {
      console.warn('[TG] poll error (reintento en 15s):', err.message);
      // Canal de RESPALDO caído en silencio = el seguro no asegura (loop-guard
      // extendido 2026-08-16): tras N fallos seguidos avisa al owner por WA.
      loopGuard.reportar('telegram_polling', false, err);
      await new Promise(r => setTimeout(r, 15_000));
    }
  }
}

function iniciarTelegram(_opts = {}) {
  if (!TOKEN) {
    console.log('[TG] TELEGRAM_BOT_TOKEN no seteado — canal de respaldo APAGADO');
    return null;
  }
  console.log('▸ arrancando telegram-handler (canal de respaldo, long polling)');
  _loop().catch(e => console.error('[TG] loop murió:', e.message));
  return { detener: () => { _detenido = true; } };
}

module.exports = { iniciarTelegram, enviarTG };
