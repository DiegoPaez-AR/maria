// google.js — wrapper unificado sobre Google APIs (Gmail + Calendar)
//
// Reemplaza a auth-gmail.js + la lógica dispersa en maria.js.
// Toda la app debería usar SOLO este módulo para hablar con Google.
//
// Uso:
//   const g = require('./google');
//   const auth = await g.autenticar();
//   const eventos = await g.listarEventosProximos({ dias: 7 });
//   const emails  = await g.listarEmailsNoLeidos({ max: 20 });
//   await g.crearEvento({ summary:'...', start:..., end:... });
//   await g.responderEmail(msgId, 'texto');

const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const vault = require('./vault');
const { conReintentos } = require('./net-retry');

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/calendar',
];

const TOKEN_PATH = process.env.GOOGLE_TOKEN_PATH || path.join(__dirname, 'token.json');
const CRED_PATH  = process.env.GOOGLE_CRED_PATH  || path.join(__dirname, 'credentials.json');

// Multi-usuario: ya no hay un calendarId "default". Cada usuario tiene el
// suyo (columna usuarios.calendar_id). Todas las ops de Calendar reciben el
// calendarId explícito del usuario que está siendo servido.
const TIMEZONE = process.env.ASISTENTE_TZ || process.env.MARIA_TZ;

// Calendario de cumpleaños. Si está seteado por env, ese gana. Si no,
// lo auto-descubrimos buscando en `listarCalendarios` uno cuyo summary
// matchee /cumple|birthday/i y cacheamos el id.
const CUMPLES_CAL_ID_ENV = process.env.MARIA_CUMPLES_CAL_ID || null;
let _cumplesCalIdCache = CUMPLES_CAL_ID_ENV;

// Firma del From: en los emails salientes. Maria manda desde su propia
// cuenta (env ASISTENTE_FROM_EMAIL del .conf de la instancia) con display
// name (ASISTENTE_FROM_NAME, o ASISTENTE_NOMBRE como fallback). MARIA_FROM_*
// quedan como compat retro por si alguna instancia legacy todavía las usa.
const FROM_NAME  = process.env.ASISTENTE_FROM_NAME  || process.env.ASISTENTE_NOMBRE  || process.env.MARIA_FROM_NAME;
const FROM_EMAIL = process.env.ASISTENTE_FROM_EMAIL || process.env.MARIA_FROM_EMAIL;

if (!FROM_EMAIL) throw new Error('[google.js] ASISTENTE_FROM_EMAIL no seteado en el .conf de la instancia');
if (!FROM_NAME)  throw new Error('[google.js] ASISTENTE_FROM_NAME o ASISTENTE_NOMBRE no seteado en el .conf de la instancia');
if (!TIMEZONE)   throw new Error('[google.js] ASISTENTE_TZ no seteado en el .conf de la instancia');

// MIME RFC 2047 encoded-word para headers no-ASCII. Si el valor es ASCII lo
// devuelve tal cual; si tiene acentos/tildes lo encodea en base64 UTF-8.
function _encodeHeader(v) {
  if (v == null) return '';
  const s = String(v);
  if (/^[\x00-\x7F]*$/.test(s)) return s;
  return `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`;
}

let _authClient = null;

/**
 * Cargar el token desde disco. Soporta dos formatos:
 *   - cifrado (.enc) — preferido cuando MARIA_VAULT_KEY está seteado
 *   - plano (.json)  — fallback / pre-vault
 *
 * Si MARIA_VAULT_KEY está seteado pero solo existe el plano, hace
 * auto-migración: cifra el plano a .enc, renombra el plano a .bak.<ts>.
 * El operador puede borrar el .bak después de confirmar que anda.
 */
function _cargarToken() {
  const encPath = `${TOKEN_PATH}.enc`;
  const tieneKey = vault.tieneKey();
  if (tieneKey && fs.existsSync(encPath)) {
    return { token: vault.descifrarArchivo(encPath), formato: 'enc' };
  }
  if (fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
    if (tieneKey) {
      // Auto-migración: hay key + plano + no .enc → cifrar y backupear plano.
      try {
        vault.cifrarArchivo(encPath, token);
        const stamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
        const bak = `${TOKEN_PATH}.bak.${stamp}`;
        fs.renameSync(TOKEN_PATH, bak);
        console.log(`[google] auto-migración: token cifrado → ${encPath}; plano respaldado en ${bak}`);
        return { token, formato: 'enc' };
      } catch (err) {
        console.warn(`[google] auto-migración falló: ${err.message} — sigo usando token plano`);
      }
    }
    return { token, formato: 'json' };
  }
  throw new Error(`google.autenticar: no encontré token en ${TOKEN_PATH} ni ${encPath}. Corré auth-gmail.js para autorizar.`);
}

/**
 * Persiste un token actualizado en el mismo formato en que está cargado.
 */
function _persistirToken(token, formato) {
  if (formato === 'enc') {
    vault.cifrarArchivo(`${TOKEN_PATH}.enc`, token);
  } else {
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(token, null, 2));
  }
}

/**
 * Devuelve un OAuth2Client ya con el token cargado. Cachea.
 */
async function autenticar() {
  if (_authClient) return _authClient;
  const creds = JSON.parse(fs.readFileSync(CRED_PATH, 'utf8'));
  const info  = creds.installed || creds.web;
  const oAuth = new google.auth.OAuth2(info.client_id, info.client_secret, info.redirect_uris[0]);
  const { token: cargado, formato } = _cargarToken();
  oAuth.setCredentials(cargado);
  // persistir refrescos automáticos (Google emite 'tokens' cuando rota el refresh_token).
  oAuth.on('tokens', (tokens) => {
    if (tokens.refresh_token) {
      try {
        const { token: cur } = _cargarToken();
        _persistirToken({ ...cur, ...tokens }, formato);
        console.log(`[google] refresh_token rotado, persistido en formato ${formato}`);
      } catch (err) {
        console.error(`[google] no pude persistir tokens nuevos: ${err.message}`);
      }
    }
  });
  _authClient = oAuth;
  return oAuth;
}

function _cal(auth) { return google.calendar({ version: 'v3', auth }); }
function _gmail(auth) { return google.gmail({ version: 'v1', auth }); }

// ─── Calendar ─────────────────────────────────────────────────────────────

/**
 * Lista calendarios visibles (útil para debug / onboarding).
 */
// Chequea el acceso real que Maria tiene a un calendar dado, leyendo el
// calendarList. Devuelve:
//   - 'none'  → el calendar no está en la lista (el user no lo compartió, o
//               el id está mal). Maria no tiene visibilidad.
//   - 'read'  → accessRole es 'reader' o 'freeBusyReader'.
//   - 'write' → accessRole es 'writer' o 'owner'.
// Usado por set_calendar_acceso para autodetectar el tier después de que
// el user comparte su calendar.
async function chequearAccesoCalendar(calendarId) {
  if (!calendarId) return 'none';
  const auth = await autenticar();
  try {
    const r = await _cal(auth).calendarList.get({ calendarId });
    const role = r.data.accessRole;
    if (role === 'writer' || role === 'owner') return 'write';
    if (role === 'reader' || role === 'freeBusyReader') return 'read';
    return 'none';
  } catch (err) {
    if (err.code === 404) return 'none';
    throw err;
  }
}

async function listarCalendarios() {
  const auth = await autenticar();
  const r = await _cal(auth).calendarList.list();
  return r.data.items.map(c => ({
    id: c.id, summary: c.summary, accessRole: c.accessRole, primary: !!c.primary,
  }));
}

/**
 * Acepta programáticamente un share de calendar añadiéndolo al calendarList
 * de Maria. Equivale a clickear el botón "Add this calendar to your list"
 * del email "X shared a calendar". Necesario porque cuando un Gmail consumer
 * comparte con otro Gmail consumer, el receptor tiene que aceptar el invite
 * antes de que el calendar aparezca en su lista (a diferencia de Workspace,
 * donde se auto-añade).
 *
 * Devuelve { ok, accessRole, error? }. Si el calendar ya estaba aceptado,
 * la API tira 409 y devolvemos ok:true con accessRole obtenido por get.
 */
async function aceptarCalendarShare(calendarId) {
  if (!calendarId) return { ok: false, error: 'calendarId vacío' };
  const auth = await autenticar();
  const cal = _cal(auth);
  try {
    const res = await cal.calendarList.insert({ requestBody: { id: calendarId } });
    return { ok: true, accessRole: res.data.accessRole };
  } catch (err) {
    // 409 Conflict → ya estaba en la lista; obtener role via get().
    if (err.code === 409) {
      try {
        const r = await cal.calendarList.get({ calendarId });
        return { ok: true, accessRole: r.data.accessRole, yaEstaba: true };
      } catch (err2) {
        return { ok: false, error: `409 al insertar, fallo el get: ${err2.message}` };
      }
    }
    return { ok: false, error: err.message };
  }
}

/**
 * Lista eventos próximos. Por defecto del calendario del usuario atendido.
 */
async function listarEventosProximos({ dias = 7, max = 20, calendarId } = {}) {
  if (!calendarId) throw new Error('listarEventosProximos: calendarId requerido');
  const auth = await autenticar();
  const ahora = new Date();
  const hasta = new Date(ahora.getTime() + dias * 24 * 3600 * 1000);
  const r = await _cal(auth).events.list({
    calendarId,
    timeMin: ahora.toISOString(),
    timeMax: hasta.toISOString(),
    maxResults: max,
    singleEvents: true,
    orderBy: 'startTime',
  });
  return (r.data.items || []).map(_normalizarEvento);
}

function _normalizarEvento(e) {
  const start = e.start?.dateTime || e.start?.date || null;
  const end   = e.end?.dateTime   || e.end?.date   || null;
  // hangoutLink aparece cuando el evento tiene una conferencia Meet resuelta.
  // Si por algún motivo no está pero hay conferenceData.entryPoints, lo extraemos.
  let meetLink = e.hangoutLink || null;
  if (!meetLink && Array.isArray(e.conferenceData?.entryPoints)) {
    const ep = e.conferenceData.entryPoints.find(p => p.entryPointType === 'video');
    if (ep?.uri) meetLink = ep.uri;
  }
  return {
    id: e.id,
    summary: e.summary || '(sin título)',
    descripcion: e.description || '',
    ubicacion: e.location || '',
    start, end,
    allDay: !e.start?.dateTime,
    link: e.htmlLink,
    meetLink,
    attendees: (e.attendees || []).map(a => a.email).filter(Boolean),
    organizerEmail: (e.organizer?.email || '').toLowerCase(),
  };
}

/**
 * Crea un evento en el calendario por defecto.
 * start/end pueden ser string ISO o Date. Si son solo fecha (YYYY-MM-DD) se crea all-day.
 *
 * Si `meet` !== false y el evento NO es all-day, auto-agrega un link de Google Meet
 * (conferenceDataVersion=1). Pasá `meet: false` explícito para eventos sin videoconf
 * (ej. un evento personal tipo "recordatorio me levanto 7am").
 */
async function crearEvento({ summary, descripcion, ubicacion, start, end, attendees = [], calendarId, meet }) {
  if (!calendarId) throw new Error('crearEvento: calendarId requerido');
  const auth = await autenticar();
  const startFmt = _formatearFecha(start);
  const endFmt   = _formatearFecha(end);
  const esAllDay = !!(startFmt?.date);

  const body = {
    summary,
    description: descripcion || '',
    location: ubicacion || '',
    start: startFmt,
    end:   endFmt,
  };
  if (attendees.length) body.attendees = attendees.map(email => ({ email }));

  // Default: Meet on para eventos con hora; off para all-day.
  const incluirMeet = meet === undefined ? !esAllDay : !!meet;
  if (incluirMeet) {
    body.conferenceData = {
      createRequest: {
        requestId: `maria-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    };
  }

  const r = await _cal(auth).events.insert({
    calendarId,
    requestBody: body,
    sendUpdates: 'all',
    conferenceDataVersion: incluirMeet ? 1 : 0,
  });
  return _normalizarEvento(r.data);
}

/**
 * Devuelve los eventos que se solapan con el rango [start, end) en el calendario
 * indicado. Usado como guarda antes de crear/modificar eventos para evitar pisar
 * algo que ya está agendado.
 *
 * Ignora:
 *  - Eventos all-day (son contexto: ubicación "Office", viajes, feriados, cumples —
 *    no bloquean horarios específicos del día).
 *  - Eventos declinados por el propio dueño del calendario.
 */
async function buscarConflictos({ start, end, calendarId, excluirEventoId = null } = {}) {
  if (!calendarId) throw new Error('buscarConflictos: calendarId requerido');
  const auth = await autenticar();
  const sISO = (start instanceof Date ? start : new Date(start)).toISOString();
  const eISO = (end   instanceof Date ? end   : new Date(end)).toISOString();
  const r = await _cal(auth).events.list({
    calendarId,
    timeMin: sISO,
    timeMax: eISO,
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 20,
  });
  const items = (r.data.items || [])
    .filter(e => !excluirEventoId || e.id !== excluirEventoId)
    // All-day events (solo .date, sin .dateTime) son contexto, no conflicto.
    .filter(e => !!e.start?.dateTime)
    .filter(e => {
      // Si el propio dueño declinó, no es conflicto.
      const self = (e.attendees || []).find(a => a.self);
      return !self || self.responseStatus !== 'declined';
    })
    .map(_normalizarEvento);
  return items;
}

/**
 * Modifica campos de un evento existente. Patch: solo cambia lo que pasás.
 */
// Devuelve un evento puntual (normalizado igual que listarEventosProximos).
// Usado por el executor para chequear ownership en tier 1.
async function obtenerEvento({ id, calendarId }) {
  if (!id || !calendarId) throw new Error('obtenerEvento: id y calendarId requeridos');
  const auth = await autenticar();
  try {
    const r = await _cal(auth).events.get({ calendarId, eventId: id });
    return _normalizarEvento(r.data);
  } catch (err) {
    if (err.code === 404) return null;
    throw err;
  }
}

async function modificarEvento({ id, summary, descripcion, ubicacion, start, end, attendees, calendarId }) {
  if (!calendarId) throw new Error('modificarEvento: calendarId requerido');
  const auth = await autenticar();
  const cal = _cal(auth);
  const body = {};
  if (summary     !== undefined) body.summary     = summary;
  if (descripcion !== undefined) body.description = descripcion;
  if (ubicacion   !== undefined) body.location    = ubicacion;
  if (start       !== undefined) body.start       = _formatearFecha(start);
  if (end         !== undefined) body.end         = _formatearFecha(end);

  // attendees: semántica de MERGE — agrega los emails que no estén ya en la
  // lista actual. NO reemplaza ni borra los existentes. Si se agrega al menos
  // un attendee nuevo, sendUpdates='all' para que Google mande invitación.
  let sendUpdates;
  if (Array.isArray(attendees) && attendees.length) {
    const existing = await cal.events.get({ calendarId, eventId: id });
    const prev = existing.data.attendees || [];
    const prevEmails = new Set(prev.map(a => (a.email || '').toLowerCase()).filter(Boolean));
    const nuevosEmails = attendees
      .map(e => (typeof e === 'string' ? e : e?.email) || '')
      .map(e => e.trim())
      .filter(e => e && !prevEmails.has(e.toLowerCase()));
    if (nuevosEmails.length) {
      body.attendees = [...prev, ...nuevosEmails.map(email => ({ email }))];
      sendUpdates = 'all';
    }
  }

  const patchOpts = { calendarId, eventId: id, requestBody: body };
  if (sendUpdates) patchOpts.sendUpdates = sendUpdates;
  const r = await cal.events.patch(patchOpts);
  return _normalizarEvento(r.data);
}

async function borrarEvento({ id, calendarId }) {
  if (!calendarId) throw new Error('borrarEvento: calendarId requerido');
  const auth = await autenticar();
  await _cal(auth).events.delete({ calendarId, eventId: id, sendUpdates: 'all' });
  return true;
}

function _formatearFecha(v) {
  if (!v) return undefined;
  // Si es solo fecha (YYYY-MM-DD), all-day
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    return { date: v };
  }
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d.getTime())) throw new Error(`Fecha inválida: ${v}`);
  return { dateTime: d.toISOString(), timeZone: TIMEZONE };
}

/**
 * Genera un link de Google Calendar pre-rellenado, sin tocar la API.
 * Útil para fallback cuando Maria NO tiene permiso de escritura.
 */
/**
 * Devuelve el calendarId del calendario de cumpleaños, o null si no lo encuentra.
 * Prioriza env var, luego auto-discover por nombre en los calendarios visibles.
 */
async function idCalendarioCumples() {
  if (_cumplesCalIdCache) return _cumplesCalIdCache;
  try {
    const cals = await listarCalendarios();
    const match = cals.find(c => /cumple|birthday/i.test(c.summary || ''));
    if (match) {
      _cumplesCalIdCache = match.id;
      return match.id;
    }
  } catch {}
  return null;
}

/**
 * Lista cumpleaños en el rango [dias] desde hoy. Devuelve eventos normalizados.
 * Si no hay calendario de cumples accesible, devuelve [].
 */
// Devuelve el calendarId primary de la cuenta autenticada (Maria). Cacheable
// porque no cambia. Usado por tier 0 / 1 cuando hay que crear eventos en el
// calendar de Maria e invitar al user como attendee.
let _mariaCalendarIdCache = null;
async function getMariaCalendarId() {
  if (_mariaCalendarIdCache) return _mariaCalendarIdCache;
  const auth = await autenticar();
  const r = await _cal(auth).calendarList.list();
  const primary = (r.data.items || []).find(c => c.primary);
  if (!primary) throw new Error('getMariaCalendarId: no encontré calendar primary');
  _mariaCalendarIdCache = primary.id;
  return primary.id;
}

// Devuelve eventos próximos del usuario, eligiendo el calendar adecuado
// según su tier:
//   - tier_2 / tier_1: del calendar del usuario (tiene visibilidad).
//   - tier_0: del calendar de Maria, filtrando solo aquellos donde el
//     usuario aparece como attendee. Sin email del user, devuelve [].
//
// Es un wrapper sobre listarEventosProximos. El caller no necesita saber
// qué calendarId usar.
async function listarEventosDelUsuario(usuario, { dias = 7, max = 30 } = {}) {
  if (!usuario) return [];
  const tieneVisibilidad = usuario.calendar_id &&
    (usuario.calendar_acceso === 'write' || usuario.calendar_acceso === 'read');
  if (tieneVisibilidad) {
    return await listarEventosProximos({ dias, max, calendarId: usuario.calendar_id });
  }
  if (!usuario.email) return [];
  const calendarId = await getMariaCalendarId();
  const eventos = await listarEventosProximos({ dias, max: 100, calendarId });
  const userEmail = usuario.email.toLowerCase();
  // listarEventosProximos normaliza attendees como array de strings (emails).
  const filtrados = eventos.filter(e =>
    Array.isArray(e.attendees) &&
    e.attendees.some(em => String(em || '').toLowerCase() === userEmail)
  );
  return filtrados.slice(0, max);
}

async function listarCumples({ dias = 1 } = {}) {
  const calId = await idCalendarioCumples();
  if (!calId) return [];
  const auth = await autenticar();
  const ahora = new Date();
  const hasta = new Date(ahora.getTime() + dias * 24 * 3600 * 1000);
  try {
    const r = await _cal(auth).events.list({
      calendarId: calId,
      timeMin: ahora.toISOString(),
      timeMax: hasta.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 100,
    });
    return (r.data.items || []).map(_normalizarEvento);
  } catch (err) {
    // Si el calendario no existe más o perdimos permiso, invalidamos cache
    _cumplesCalIdCache = CUMPLES_CAL_ID_ENV;
    throw err;
  }
}

function linkCrearEventoPrellenado({ summary, descripcion = '', start, end, ubicacion = '' }) {
  const fmt = (v) => {
    if (!v) return '';
    const d = v instanceof Date ? v : new Date(v);
    return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  };
  const dates = start && end ? `${fmt(start)}/${fmt(end)}` : '';
  const qs = new URLSearchParams({
    action: 'TEMPLATE',
    text: summary || '',
    details: descripcion,
    location: ubicacion,
    dates,
  });
  return `https://calendar.google.com/calendar/render?${qs.toString()}`;
}

// ─── Gmail ────────────────────────────────────────────────────────────────

/**
 * Lista emails no leídos (INBOX + UNREAD).
 */
async function listarEmailsNoLeidos({ max = 20 } = {}) {
  const auth = await autenticar();
  // Path de alto volumen (poll): reintentos ante 429/5xx transitorios de Gmail.
  const list = await conReintentos(() => _gmail(auth).users.messages.list({
    userId: 'me',
    q: 'is:unread in:inbox',
    maxResults: max,
  }), { tag: 'gmail.messages.list' });
  const ids = (list.data.messages || []).map(m => m.id);
  const emails = [];
  for (const id of ids) {
    const m = await conReintentos(() => _gmail(auth).users.messages.get({ userId: 'me', id, format: 'metadata',
      metadataHeaders: ['From', 'To', 'Subject', 'Date'] }), { tag: 'gmail.messages.get' });
    const headers = Object.fromEntries((m.data.payload?.headers || []).map(h => [h.name, h.value]));
    emails.push({
      id,
      threadId: m.data.threadId,
      de: headers.From || '',
      para: headers.To || '',
      asunto: headers.Subject || '',
      fecha: headers.Date || '',
      snippet: m.data.snippet || '',
    });
  }
  return emails;
}

/**
 * Trae el cuerpo completo de un email (texto plano).
 */
async function leerEmail(messageId) {
  const auth = await autenticar();
  const m = await conReintentos(
    () => _gmail(auth).users.messages.get({ userId: 'me', id: messageId, format: 'full' }),
    { tag: 'gmail.messages.get' }
  );
  const headers = Object.fromEntries((m.data.payload?.headers || []).map(h => [h.name, h.value]));
  const cuerpo = _extraerTextoPlano(m.data.payload);
  const adjuntos = _extraerAdjuntosMeta(m.data.payload);
  return {
    id: messageId,
    threadId: m.data.threadId,
    de: headers.From || '',
    para: headers.To || '',
    cc: headers.Cc || '',
    messageIdHeader: headers['Message-ID'] || headers['Message-Id'] || '',
    asunto: headers.Subject || '',
    fecha: headers.Date || '',
    snippet: m.data.snippet || '',
    cuerpo,
    adjuntos,
  };
}

// Recorre el payload buscando partes que sean attachments (tienen attachmentId
// y filename). NO descarga los bytes — solo metadata. Para los bytes usar
// descargarAdjunto(messageId, attachmentId).
function _extraerAdjuntosMeta(payload, acc = []) {
  if (!payload) return acc;
  const body = payload.body || {};
  const filename = payload.filename || '';
  if (body.attachmentId && filename) {
    acc.push({
      attachmentId: body.attachmentId,
      filename,
      mimeType: payload.mimeType || 'application/octet-stream',
      size: body.size || 0,
    });
  }
  if (Array.isArray(payload.parts)) {
    for (const p of payload.parts) _extraerAdjuntosMeta(p, acc);
  }
  return acc;
}

// Descarga los bytes de un adjunto del email. Devuelve Buffer.
async function descargarAdjunto(messageId, attachmentId) {
  const auth = await autenticar();
  const r = await _gmail(auth).users.messages.attachments.get({
    userId: 'me',
    messageId,
    id: attachmentId,
  });
  const data = r.data?.data;
  if (!data) throw new Error(`descargarAdjunto: respuesta vacía (msg=${messageId} att=${attachmentId})`);
  // Gmail API devuelve base64url. Convertimos a Buffer.
  const b64 = data.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(b64, 'base64');
}

function _extraerTextoPlano(payload) {
  if (!payload) return '';
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf8');
  }
  if (payload.parts) {
    // buscar primero text/plain, si no hay caer en text/html plano
    for (const p of payload.parts) {
      if (p.mimeType === 'text/plain' && p.body?.data) {
        return Buffer.from(p.body.data, 'base64').toString('utf8');
      }
    }
    for (const p of payload.parts) {
      const t = _extraerTextoPlano(p);
      if (t) return t;
    }
  }
  return '';
}

/**
 * Marca un email como leído (remueve label UNREAD).
 */
async function marcarLeido(messageId) {
  const auth = await autenticar();
  await _gmail(auth).users.messages.modify({
    userId: 'me',
    id: messageId,
    requestBody: { removeLabelIds: ['UNREAD'] },
  });
}

/**
 * Busca mensajes de Gmail intercambiados con `email` en los últimos `dias`
 * (tanto entrantes como salientes). Devuelve una lista con { id, saliente,
 * fecha, asunto, snippet } ordenada por fecha ascendente.
 *
 * Usado por unknown-flow / context-fetcher para darle al LLM el historial
 * reciente con un remitente desconocido.
 */
async function buscarMensajesCon(email, { dias = 14, max = 50 } = {}) {
  if (!email) return [];
  const e = String(email).trim().toLowerCase();
  if (!e.includes('@')) return [];
  const auth = await autenticar();
  const q = `(from:${e} OR to:${e}) newer_than:${dias}d`;
  const list = await _gmail(auth).users.messages.list({
    userId: 'me', q, maxResults: max,
  });
  const ids = (list.data.messages || []).map(m => m.id);
  const mensajes = [];
  for (const id of ids) {
    try {
      const m = await _gmail(auth).users.messages.get({
        userId: 'me', id, format: 'metadata',
        metadataHeaders: ['From', 'To', 'Subject', 'Date'],
      });
      const headers = Object.fromEntries((m.data.payload?.headers || []).map(h => [h.name, h.value]));
      const from = (headers.From || '').toLowerCase();
      // "saliente" desde Maria = from contiene nuestro email; si no tenemos
      // match exacto, nos basamos en si el from incluye el email del contacto
      // (entrante) o no (saliente).
      const saliente = !from.includes(e);
      const fechaIso = headers.Date ? new Date(headers.Date).toISOString() : '';
      mensajes.push({
        id,
        saliente,
        fecha: fechaIso,
        asunto: headers.Subject || '',
        snippet: m.data.snippet || '',
      });
    } catch {
      // si un mensaje no se puede leer, lo salteamos
    }
  }
  // ordenar por fecha ascendente
  mensajes.sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
  return mensajes;
}

/**
 * Envía un email nuevo (sin threading). Diferencias con responderEmail:
 *  - no requiere messageId previo
 *  - no setea In-Reply-To/References/threadId
 *  - acepta to/cc/bcc como string o array, y replyTo opcional
 *
 * Devuelve { id, threadId } del mensaje enviado.
 */
// ── Firma con canal Telegram (2026-07-07, pedido Diego) ────────────────────
// Va en TODOS los emails salientes: es la vía para que un tercero (que por
// Telegram no podemos iniciar nosotros) abra el chat con el bot él mismo.
function _conFirmaTG(texto) {
  const user = (process.env.TELEGRAM_BOT_USERNAME || '').replace(/^@/, '');
  if (!user) return texto;
  const link = `https://t.me/${user}`;
  if (String(texto).includes(link)) return texto; // no duplicar
  return `${texto}\n\n—\n💬 Telegram: ${link}`;
}
function _conFirmaTGHtml(html) {
  const user = (process.env.TELEGRAM_BOT_USERNAME || '').replace(/^@/, '');
  if (!user) return html;
  const link = `https://t.me/${user}`;
  if (String(html).includes(link)) return html;
  const firma = `<p style="color:#777;font-size:13px">—<br>💬 Telegram: <a href="${link}">${link}</a></p>`;
  return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, firma + '</body>') : html + firma;
}

async function enviarEmail({ to, asunto, texto, html, cc, bcc, replyTo }) {
  if (!to)                                      throw new Error('enviarEmail: falta "to"');
  if (asunto === undefined || asunto === null)  throw new Error('enviarEmail: falta "asunto"');
  if (texto  === undefined || texto  === null)  throw new Error('enviarEmail: falta "texto"');
  texto = _conFirmaTG(texto);
  if (html) html = _conFirmaTGHtml(html);

  const auth = await autenticar();

  const tos  = Array.isArray(to)  ? to.join(', ')  : to;
  const ccs  = cc  ? (Array.isArray(cc)  ? cc.join(', ')  : cc)  : null;
  const bccs = bcc ? (Array.isArray(bcc) ? bcc.join(', ') : bcc) : null;

  const headers = [
    `From: ${_encodeHeader(FROM_NAME)} <${FROM_EMAIL}>`,
    `To: ${tos}`,
  ];
  if (ccs)     headers.push(`Cc: ${ccs}`);
  if (bccs)    headers.push(`Bcc: ${bccs}`);
  if (replyTo) headers.push(`Reply-To: ${replyTo}`);
  headers.push(
    `Subject: ${_encodeHeader(asunto)}`,
    `MIME-Version: 1.0`,
  );

  let body;
  if (html) {
    // multipart/alternative: texto plano (fallback) + html.
    const boundary = '----maria_boundary_' + Math.random().toString(36).slice(2);
    headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    body = [
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      texto,
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      html,
      '',
      `--${boundary}--`,
      '',
    ].join('\r\n');
  } else {
    headers.push(
      `Content-Type: text/plain; charset=UTF-8`,
      `Content-Transfer-Encoding: 8bit`,
    );
    body = '\r\n' + texto;
  }

  const raw = Buffer.from(headers.join('\r\n') + body).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const r = await conReintentos(() => _gmail(auth).users.messages.send({
    userId: 'me',
    requestBody: { raw },
  }), { tag: 'gmail.messages.send' });
  return { id: r.data.id, threadId: r.data.threadId };
}

/**
 * Responde a un email (mantiene threading).
 */
async function responderEmail(messageId, textoRespuesta, opts = {}) {
  const { replyAll = false, cc: ccOverride } = opts;
  textoRespuesta = _conFirmaTG(textoRespuesta);
  const auth = await autenticar();
  const original = await leerEmail(messageId);

  // Helpers para normalizar listas de direcciones de un header (To/Cc).
  const _split = (h) => (h || '').split(',').map(s => s.trim()).filter(Boolean);
  const _emailOf = (s) => {
    const m = String(s).match(/<([^>]+)>/);
    return (m ? m[1] : s).trim().toLowerCase();
  };
  const meEmail = FROM_EMAIL.toLowerCase();

  let to;
  let cc = null;

  if (replyAll) {
    // To = sender + (originalTo - maria), dedup por email.
    const otrosTo = _split(original.para).filter(s => _emailOf(s) !== meEmail);
    const senderEmail = _emailOf(original.de);
    const toList = [original.de];
    for (const x of otrosTo) {
      if (_emailOf(x) !== senderEmail) toList.push(x);
    }
    to = toList.join(', ');
    // Cc = originalCc - maria.
    const ccList = _split(original.cc).filter(s => _emailOf(s) !== meEmail);
    cc = ccList.length ? ccList.join(', ') : null;
  } else {
    to = original.de;
  }
  // Override explícito de cc desde el caller (ej: Claude pidió cc específico).
  if (ccOverride !== undefined) cc = ccOverride || null;

  const asunto  = original.asunto.startsWith('Re:') ? original.asunto : `Re: ${original.asunto}`;
  // Para threading correcto entre clientes (Outlook, Apple Mail, otros Gmail),
  // In-Reply-To/References deben ser el Message-ID RFC822 del header, no el
  // id de la API de Gmail. Caemos al messageId como fallback si no lo tenemos.
  const inReplyTo = original.messageIdHeader || `<${messageId}@mail.gmail.com>`;

  const rawLines = [
    `From: ${_encodeHeader(FROM_NAME)} <${FROM_EMAIL}>`,
    `To: ${to}`,
  ];
  if (cc) rawLines.push(`Cc: ${cc}`);
  rawLines.push(
    `Subject: ${_encodeHeader(asunto)}`,
    `In-Reply-To: ${inReplyTo}`,
    `References: ${inReplyTo}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=UTF-8`,
    `Content-Transfer-Encoding: 8bit`,
    ``,
    textoRespuesta,
  );
  const raw = Buffer.from(rawLines.join('\r\n')).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  await _gmail(auth).users.messages.send({
    userId: 'me',
    requestBody: { raw, threadId: original.threadId },
  });
  await marcarLeido(messageId);
  return { to, cc, replyAll };
}

// ─── Exports ──────────────────────────────────────────────────────────────

module.exports = {
  autenticar,
  // Calendar
  listarCalendarios,
  chequearAccesoCalendar,
  aceptarCalendarShare,
  listarEventosProximos,
  listarEventosDelUsuario,
  getMariaCalendarId,
  listarCumples,
  idCalendarioCumples,
  crearEvento,
  obtenerEvento,
  modificarEvento,
  borrarEvento,
  buscarConflictos,
  linkCrearEventoPrellenado,
  // Gmail
  listarEmailsNoLeidos,
  leerEmail,
  marcarLeido,
  enviarEmail,
  responderEmail,
  buscarMensajesCon,
  descargarAdjunto,
  // constantes
  SCOPES,
  TIMEZONE,
  MARIA_EMAIL: FROM_EMAIL,
  MARIA_FROM_NAME: FROM_NAME,
};
