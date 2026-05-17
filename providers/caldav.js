// providers/caldav.js — implementación del CalendarProvider para CalDAV.
//
// CalDAV (RFC 4791) es el protocolo estándar para acceso a calendarios
// servidos por iCloud, Yahoo, Fastmail, Nextcloud, Sabre/dav y otros.
// A diferencia de Google/Microsoft, NO requiere OAuth ni un proyecto
// registrado — solo URL del server + username + password (típicamente
// un "app-specific password" generado en la cuenta del proveedor).
//
// Cada user CalDAV trae sus credenciales en `usuarios.calendar_auth_json`
// (cifrado en DB con vault). Maria opera con esas credenciales contra el
// calendar del user — write completo, sin tiers (no hay share invites
// como en Google: el user da credenciales y listo).
//
// Servers conocidos (ver docs/caldav-providers.md):
//   - iCloud:   https://caldav.icloud.com/        + Apple ID + app password
//   - Yahoo:    https://caldav.calendar.yahoo.com/ + Yahoo ID + app password
//   - Fastmail: https://caldav.fastmail.com/dav/   + email + app password
//
// Shape de calendar_auth_json:
//   {
//     "server_url":   "...",       // base de discovery
//     "username":     "user@x",
//     "password":     "xxxx-xxxx",  // app-specific password
//     "calendar_url": "https://...", // descubierto la 1a vez y cacheado
//     "calendar_id":  "..."          // opcional, si el user tiene múltiples
//                                    //  calendars y quiere usar uno específico
//   }
//
// La librería tsdav (https://github.com/natelindev/tsdav) hace el heavy
// lifting de WebDAV/CalDAV. Importamos dinámicamente porque tsdav 2.x
// es ESM-only y este proyecto es CommonJS.

const vault = require('../vault');
const googleProvider = require('./google');

// Cache módulo-level de tsdav. La primera invocación lo importa, las
// siguientes reusan.
let _tsdavMod = null;
async function _tsdav() {
  if (_tsdavMod) return _tsdavMod;
  _tsdavMod = await import('tsdav');
  return _tsdavMod;
}

// Cache de clients por usuario.id. CalDAV es stateful (cookies, etag,
// principal discovery) — conviene cachear el client durante el lifetime
// del proceso. Si el calendar_auth_json del user cambia, se invalida
// reiniciando pm2.
const _clientCache = new Map();

// ─── Helpers privados ────────────────────────────────────────────────────

function _credenciales(usuario) {
  if (!usuario || !usuario.calendar_auth_json) {
    throw new Error(`caldav: usuario ${usuario && usuario.id} no tiene calendar_auth_json — configurar antes de usar`);
  }
  let creds;
  try {
    creds = vault.descifrar(usuario.calendar_auth_json);
  } catch (err) {
    throw new Error(`caldav: no pude descifrar calendar_auth_json de ${usuario.nombre}: ${err.message}`);
  }
  if (!creds.server_url || !creds.username || !creds.password) {
    throw new Error(`caldav: calendar_auth_json de ${usuario.nombre} incompleto (faltan server_url/username/password)`);
  }
  return creds;
}

async function _connectAndDiscover(creds) {
  const { createDAVClient } = await _tsdav();
  const client = await createDAVClient({
    serverUrl: creds.server_url,
    credentials: { username: creds.username, password: creds.password },
    authMethod: 'Basic',
    defaultAccountType: 'caldav',
  });
  let calendar = null;
  if (creds.calendar_url) {
    const cals = await client.fetchCalendars();
    calendar = cals.find(c => c.url === creds.calendar_url) || null;
  }
  if (!calendar) {
    const cals = await client.fetchCalendars();
    if (!cals.length) {
      throw new Error(`caldav: el server ${creds.server_url} no devolvió calendars para ${creds.username}`);
    }
    if (creds.calendar_id) {
      calendar = cals.find(c => c.url === creds.calendar_id || c.displayName === creds.calendar_id);
      if (!calendar) calendar = cals[0];
    } else {
      calendar = cals[0];
    }
  }
  return { client, calendar };
}

function _icalEsc(s) {
  return String(s || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '');
}

function _isoToICalUTC(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) throw new Error(`caldav: fecha inválida "${iso}"`);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

function _payloadToIcal(payload, { uid } = {}) {
  const evtUid = uid || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}@maria`;
  const dtStart = _isoToICalUTC(payload.start);
  const dtEnd = _isoToICalUTC(payload.end);
  const stamp = _isoToICalUTC(new Date().toISOString());
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Maria Secretaria//CalDAV//ES',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${evtUid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${_icalEsc(payload.summary || '(sin título)')}`,
  ];
  if (payload.descripcion) lines.push(`DESCRIPTION:${_icalEsc(payload.descripcion)}`);
  if (payload.ubicacion) lines.push(`LOCATION:${_icalEsc(payload.ubicacion)}`);
  if (Array.isArray(payload.attendees)) {
    for (const a of payload.attendees) {
      const email = typeof a === 'string' ? a : a && a.email;
      if (email) lines.push(`ATTENDEE;RSVP=TRUE:mailto:${email}`);
    }
  }
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return { ical: lines.join('\r\n'), uid: evtUid };
}

function _icalToEvento(calObj) {
  const raw = (calObj && calObj.data) || '';
  const get = (k) => {
    const m = raw.match(new RegExp(`^${k}(?:;[^:]*)?:(.+)$`, 'm'));
    return m ? m[1].trim() : null;
  };
  const unesc = (s) => s == null ? null : s
    .replace(/\\n/g, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
  const icalToIso = (v) => {
    if (!v) return null;
    const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
    if (!m) return v;
    const [, y, mo, d, h, mi, s, z] = m;
    return `${y}-${mo}-${d}T${h}:${mi}:${s}${z || ''}`;
  };
  return {
    id: calObj && calObj.url ? calObj.url : null,
    etag: calObj && calObj.etag ? calObj.etag : null,
    uid: get('UID'),
    summary: unesc(get('SUMMARY')),
    descripcion: unesc(get('DESCRIPTION')),
    ubicacion: unesc(get('LOCATION')),
    start: icalToIso(get('DTSTART')),
    end: icalToIso(get('DTEND')),
    allDay: false,
    raw,
  };
}

// ─── CalendarProvider interface ──────────────────────────────────────────

async function getContext(usuario) {
  if (!usuario || !usuario.id) {
    throw new Error('caldav.getContext: usuario requerido');
  }
  const cached = _clientCache.get(usuario.id);
  if (cached) return cached;
  const creds = _credenciales(usuario);
  const { client, calendar } = await _connectAndDiscover(creds);
  const ctx = { kind: 'caldav', usuario, client, calendar, creds };
  _clientCache.set(usuario.id, ctx);
  return ctx;
}

async function listarEventosProximos(ctx, opts = {}) {
  const dias = opts.dias || 14;
  const now = new Date();
  const end = new Date(now.getTime() + dias * 86400000);
  const objs = await ctx.client.fetchCalendarObjects({
    calendar: ctx.calendar,
    timeRange: { start: now.toISOString(), end: end.toISOString() },
  });
  return objs.map(_icalToEvento).filter(e => e.start);
}

async function listarEventosDelUsuario(ctx, usuario, opts = {}) {
  return listarEventosProximos(ctx, opts);
}

async function crearEvento(ctx, payload) {
  const { ical, uid } = _payloadToIcal(payload);
  const filename = `${uid}.ics`;
  const res = await ctx.client.createCalendarObject({
    calendar: ctx.calendar,
    filename,
    iCalString: ical,
  });
  return {
    id: (res && res.url) || `${ctx.calendar.url}${filename}`,
    uid,
    summary: payload.summary,
    start: payload.start,
    end: payload.end,
    htmlLink: null,
  };
}

async function obtenerEvento(ctx, opts) {
  const url = opts.id || opts.url;
  if (!url) throw new Error('caldav.obtenerEvento: id (url) requerido');
  const objs = await ctx.client.fetchCalendarObjects({
    calendar: ctx.calendar,
    objectUrls: [url],
  });
  if (!objs.length) return null;
  return _icalToEvento(objs[0]);
}

async function modificarEvento(ctx, payload) {
  const url = payload.id || payload.url;
  if (!url) throw new Error('caldav.modificarEvento: id (url) requerido');
  const actual = await obtenerEvento(ctx, { id: url });
  if (!actual) throw new Error(`caldav.modificarEvento: evento ${url} no encontrado`);
  const { ical } = _payloadToIcal(
    { ...payload, summary: payload.summary ?? actual.summary, start: payload.start ?? actual.start, end: payload.end ?? actual.end },
    { uid: actual.uid }
  );
  await ctx.client.updateCalendarObject({
    calendarObject: { url, etag: actual.etag, data: ical },
  });
  return { id: url, uid: actual.uid, summary: payload.summary ?? actual.summary };
}

async function borrarEvento(ctx, opts) {
  const url = opts.id || opts.url;
  if (!url) throw new Error('caldav.borrarEvento: id (url) requerido');
  let etag = opts.etag;
  if (!etag) {
    const actual = await obtenerEvento(ctx, { id: url });
    etag = actual && actual.etag;
  }
  await ctx.client.deleteCalendarObject({ calendarObject: { url, etag } });
  return { id: url, borrado: true };
}

async function buscarConflictos(ctx, opts) {
  const { start, end, excluirEventoId } = opts;
  const objs = await ctx.client.fetchCalendarObjects({
    calendar: ctx.calendar,
    timeRange: { start, end },
  });
  const eventos = objs.map(_icalToEvento).filter(e => e.start && e.end);
  const sIso = new Date(start).toISOString();
  const eIso = new Date(end).toISOString();
  return eventos.filter(ev => {
    if (excluirEventoId && ev.id === excluirEventoId) return false;
    const evS = new Date(ev.start).toISOString();
    const evE = new Date(ev.end).toISOString();
    return evS < eIso && sIso < evE;
  });
}

async function listarCalendarios(ctx) {
  const cals = await ctx.client.fetchCalendars();
  return cals.map(c => ({
    id: c.url,
    summary: c.displayName || c.url,
    primary: false,
    accessRole: 'owner',
  }));
}

async function chequearAccesoCalendar(ctx, calendarId) {
  const cals = await listarCalendarios(ctx);
  return cals.some(c => c.id === calendarId) ? 'write' : 'none';
}

// ─── No-aplica / delegación a Google ─────────────────────────────────────

async function aceptarCalendarShare(ctx, calendarId) {
  return { accepted: true, motivo: 'caldav no usa shares — credenciales directas dan acceso write' };
}

let _googleCtxMaria = null;
async function _googleCtx() {
  if (_googleCtxMaria) return _googleCtxMaria;
  _googleCtxMaria = await googleProvider.getContext(null);
  return _googleCtxMaria;
}
async function getMariaCalendarId(_ctx) { return googleProvider.getMariaCalendarId(await _googleCtx()); }
async function idCalendarioCumples(_ctx) { return googleProvider.idCalendarioCumples(await _googleCtx()); }
async function listarCumples(_ctx, opts) { return googleProvider.listarCumples(await _googleCtx(), opts); }

function linkCrearEventoPrellenado(_ctx, _opts) {
  return null;
}

module.exports = {
  kind: 'caldav',
  getContext,
  listarEventosProximos,
  listarEventosDelUsuario,
  crearEvento,
  obtenerEvento,
  modificarEvento,
  borrarEvento,
  buscarConflictos,
  listarCalendarios,
  chequearAccesoCalendar,
  aceptarCalendarShare,
  getMariaCalendarId,
  idCalendarioCumples,
  listarCumples,
  linkCrearEventoPrellenado,
};
