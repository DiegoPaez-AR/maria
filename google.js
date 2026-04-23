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

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/calendar',
];

const TOKEN_PATH = process.env.GOOGLE_TOKEN_PATH || path.join(__dirname, 'token.json');
const CRED_PATH  = process.env.GOOGLE_CRED_PATH  || path.join(__dirname, 'credentials.json');

// Multi-usuario: ya no hay un calendarId "default". Cada usuario tiene el
// suyo (columna usuarios.calendar_id). Todas las ops de Calendar reciben el
// calendarId explícito del usuario que está siendo servido.
const TIMEZONE = process.env.MARIA_TZ || 'America/Argentina/Buenos_Aires';

// Calendario de cumpleaños. Si está seteado por env, ese gana. Si no,
// lo auto-descubrimos buscando en `listarCalendarios` uno cuyo summary
// matchee /cumple|birthday/i y cacheamos el id.
const CUMPLES_CAL_ID_ENV = process.env.MARIA_CUMPLES_CAL_ID || null;
let _cumplesCalIdCache = CUMPLES_CAL_ID_ENV;

// Firma del From: en los emails salientes. Maria manda desde SU cuenta
// (maria.paez.secre@gmail.com) pero con display name "Maria Paez".
const FROM_NAME  = process.env.MARIA_FROM_NAME  || 'Maria Paez';
const FROM_EMAIL = process.env.MARIA_FROM_EMAIL || 'maria.paez.secre@gmail.com';

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
 * Devuelve un OAuth2Client ya con el token cargado. Cachea.
 */
async function autenticar() {
  if (_authClient) return _authClient;
  const creds = JSON.parse(fs.readFileSync(CRED_PATH, 'utf8'));
  const info  = creds.installed || creds.web;
  const oAuth = new google.auth.OAuth2(info.client_id, info.client_secret, info.redirect_uris[0]);
  oAuth.setCredentials(JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8')));
  // persistir refrescos automáticos
  oAuth.on('tokens', (tokens) => {
    if (tokens.refresh_token) {
      const cur = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
      fs.writeFileSync(TOKEN_PATH, JSON.stringify({ ...cur, ...tokens }, null, 2));
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
async function listarCalendarios() {
  const auth = await autenticar();
  const r = await _cal(auth).calendarList.list();
  return r.data.items.map(c => ({
    id: c.id, summary: c.summary, accessRole: c.accessRole, primary: !!c.primary,
  }));
}

/**
 * Lista eventos próximos. Por defecto del calendario de Diego.
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
async function modificarEvento({ id, summary, descripcion, ubicacion, start, end, calendarId }) {
  if (!calendarId) throw new Error('modificarEvento: calendarId requerido');
  const auth = await autenticar();
  const body = {};
  if (summary     !== undefined) body.summary     = summary;
  if (descripcion !== undefined) body.description = descripcion;
  if (ubicacion   !== undefined) body.location    = ubicacion;
  if (start       !== undefined) body.start       = _formatearFecha(start);
  if (end         !== undefined) body.end         = _formatearFecha(end);
  const r = await _cal(auth).events.patch({ calendarId, eventId: id, requestBody: body });
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
  const list = await _gmail(auth).users.messages.list({
    userId: 'me',
    q: 'is:unread in:inbox',
    maxResults: max,
  });
  const ids = (list.data.messages || []).map(m => m.id);
  const emails = [];
  for (const id of ids) {
    const m = await _gmail(auth).users.messages.get({ userId: 'me', id, format: 'metadata',
      metadataHeaders: ['From', 'To', 'Subject', 'Date'] });
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
  const m = await _gmail(auth).users.messages.get({ userId: 'me', id: messageId, format: 'full' });
  const headers = Object.fromEntries((m.data.payload?.headers || []).map(h => [h.name, h.value]));
  const cuerpo = _extraerTextoPlano(m.data.payload);
  return {
    id: messageId,
    threadId: m.data.threadId,
    de: headers.From || '',
    para: headers.To || '',
    asunto: headers.Subject || '',
    fecha: headers.Date || '',
    snippet: m.data.snippet || '',
    cuerpo,
  };
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
 * Responde a un email (mantiene threading).
 */
async function responderEmail(messageId, textoRespuesta) {
  const auth = await autenticar();
  const original = await leerEmail(messageId);

  const to      = original.de;
  const asunto  = original.asunto.startsWith('Re:') ? original.asunto : `Re: ${original.asunto}`;
  const rawLines = [
    `From: ${_encodeHeader(FROM_NAME)} <${FROM_EMAIL}>`,
    `To: ${to}`,
    `Subject: ${_encodeHeader(asunto)}`,
    `In-Reply-To: ${messageId}`,
    `References: ${messageId}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=UTF-8`,
    `Content-Transfer-Encoding: 8bit`,
    ``,
    textoRespuesta,
  ];
  const raw = Buffer.from(rawLines.join('\r\n')).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  await _gmail(auth).users.messages.send({
    userId: 'me',
    requestBody: { raw, threadId: original.threadId },
  });
  await marcarLeido(messageId);
  return true;
}

// ─── Exports ──────────────────────────────────────────────────────────────

module.exports = {
  autenticar,
  // Calendar
  listarCalendarios,
  listarEventosProximos,
  listarCumples,
  idCalendarioCumples,
  crearEvento,
  modificarEvento,
  borrarEvento,
  buscarConflictos,
  linkCrearEventoPrellenado,
  // Gmail
  listarEmailsNoLeidos,
  leerEmail,
  marcarLeido,
  responderEmail,
  // constantes
  SCOPES,
  TIMEZONE,
};
