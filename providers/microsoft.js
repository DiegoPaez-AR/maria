// providers/microsoft.js — implementación del CalendarProvider para Microsoft Graph.
//
// A diferencia de Google (auth compartido de Maria) y CalDAV (creds simples
// con app password), Microsoft usa OAuth2 PKCE por usuario:
//
//   1. Maria genera un Authorization URL con el client_id de Azure, scopes
//      delegados (Calendars.ReadWrite, User.Read, offline_access), state,
//      code_verifier + code_challenge (PKCE).
//   2. El user abre la URL en su browser, se loguea con su cuenta Microsoft,
//      autoriza, y el browser redirige a http://localhost/maria-oauth-callback
//      con ?code=... en la query. El user copia el `code` y se lo manda a Maria.
//   3. Maria intercambia el code (junto con el code_verifier) por un
//      access_token + refresh_token via la acción `configurar_microsoft`.
//      El refresh_token se cifra con vault y se persiste en
//      usuarios.calendar_auth_json.
//   4. Cada vez que Maria opera contra MS Graph, usa el refresh_token para
//      conseguir un access_token fresco si el actual venció.
//
// Shape de calendar_auth_json (cifrado con vault):
//   {
//     "refresh_token": "...",
//     "access_token":  "...",  // opcional, se renueva on-demand
//     "expires_at":    1234567890,  // unix ms
//     "scope":         "Calendars.ReadWrite User.Read offline_access",
//     "calendar_id":   "AAMkAGI..."  // id del calendar default, descubierto al setup
//   }
//
// Los pares (client_id, tenant, redirect_uri) vienen de env vars del .conf:
//   MS_CLIENT_ID, MS_TENANT (default 'common'), MS_REDIRECT_URI.

const vault = require('../vault');
const googleProvider = require('./google');

const MS_CLIENT_ID    = process.env.MS_CLIENT_ID    || null;
const MS_TENANT       = process.env.MS_TENANT       || 'common';
const MS_REDIRECT_URI = process.env.MS_REDIRECT_URI || 'http://localhost/maria-oauth-callback';
const MS_SCOPES       = ['Calendars.ReadWrite', 'User.Read', 'offline_access'];

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const AUTH_BASE  = `https://login.microsoftonline.com/${MS_TENANT}/oauth2/v2.0`;

// Cache por usuario.id — access_token + expires_at en memoria, para evitar
// refreshear cada llamada. Si pm2 restartea, se rebuildea.
const _tokenCache = new Map();

// ─── PKCE helpers ────────────────────────────────────────────────────────

function _randomBase64Url(bytes = 32) {
  const crypto = require('crypto');
  return crypto.randomBytes(bytes).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function _sha256Base64Url(input) {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(input).digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Genera un par {verifier, challenge} PKCE. El verifier lo guarda Maria
 * (en memoria por sesión de onboarding). El challenge va en la auth URL.
 */
function nuevoPkcePair() {
  const verifier = _randomBase64Url(32);
  const challenge = _sha256Base64Url(verifier);
  return { verifier, challenge };
}

/**
 * Construye la URL de autorización que el user abre en su browser.
 * Retorna { url, state, verifier } — guardar state + verifier para el callback.
 */
function buildAuthUrl({ state, codeChallenge, loginHint = null }) {
  if (!MS_CLIENT_ID) {
    throw new Error('microsoft: MS_CLIENT_ID no seteado en el .conf');
  }
  const params = new URLSearchParams({
    client_id: MS_CLIENT_ID,
    response_type: 'code',
    redirect_uri: MS_REDIRECT_URI,
    scope: MS_SCOPES.join(' '),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
  });
  if (loginHint) params.set('login_hint', loginHint);
  return `${AUTH_BASE}/authorize?${params.toString()}`;
}

/**
 * Intercambia el `code` recibido del user por tokens (refresh + access).
 * Necesita el code_verifier que se generó al armar la auth URL.
 */
async function intercambiarCodePorTokens({ code, codeVerifier }) {
  const body = new URLSearchParams({
    client_id: MS_CLIENT_ID,
    grant_type: 'authorization_code',
    code,
    redirect_uri: MS_REDIRECT_URI,
    code_verifier: codeVerifier,
    scope: MS_SCOPES.join(' '),
  });
  const res = await fetch(`${AUTH_BASE}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`microsoft.intercambiarCode: ${res.status} — ${txt.slice(0, 400)}`);
  }
  return res.json(); // { access_token, refresh_token, expires_in, scope, token_type, ... }
}

/**
 * Refresca el access_token usando el refresh_token. Microsoft rota
 * refresh_tokens en cada uso (sliding window), así que hay que persistir
 * el nuevo también.
 */
async function refrescarAccessToken(refreshToken) {
  const body = new URLSearchParams({
    client_id: MS_CLIENT_ID,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope: MS_SCOPES.join(' '),
  });
  const res = await fetch(`${AUTH_BASE}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`microsoft.refrescar: ${res.status} — ${txt.slice(0, 400)}`);
  }
  return res.json();
}

// ─── Internal: cargar/persistir auth del usuario ─────────────────────────

const usuarios = require('../usuarios');

function _credenciales(usuario) {
  if (!usuario || !usuario.calendar_auth_json) {
    throw new Error(`microsoft: usuario ${usuario && usuario.id} no tiene calendar_auth_json — correr configurar_microsoft primero`);
  }
  try {
    return vault.descifrar(usuario.calendar_auth_json);
  } catch (err) {
    throw new Error(`microsoft: no pude descifrar calendar_auth_json de ${usuario.nombre}: ${err.message}`);
  }
}

function _persistirCreds(usuarioId, creds) {
  const blob = vault.cifrar(creds);
  usuarios.actualizar(usuarioId, { calendar_auth_json: blob });
}

/**
 * Devuelve un access_token válido para el usuario, refrescando si hace falta.
 * Persiste el nuevo refresh_token y actualiza el cache en memoria.
 */
async function _getAccessToken(usuario) {
  const cached = _tokenCache.get(usuario.id);
  const ahora = Date.now();
  if (cached && cached.expires_at > ahora + 60_000) {
    return cached.access_token;
  }
  const creds = _credenciales(usuario);
  if (!creds.refresh_token) {
    throw new Error(`microsoft: usuario ${usuario.nombre} no tiene refresh_token — re-correr configurar_microsoft`);
  }
  const tk = await refrescarAccessToken(creds.refresh_token);
  const nuevoCreds = {
    ...creds,
    refresh_token: tk.refresh_token || creds.refresh_token, // MS rota el refresh
    access_token: tk.access_token,
    expires_at: ahora + (tk.expires_in || 3600) * 1000,
    scope: tk.scope || creds.scope,
  };
  _persistirCreds(usuario.id, nuevoCreds);
  _tokenCache.set(usuario.id, nuevoCreds);
  return tk.access_token;
}

async function _graphFetch(usuario, pathOrUrl, opts = {}) {
  const tk = await _getAccessToken(usuario);
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${GRAPH_BASE}${pathOrUrl}`;
  const headers = {
    'Authorization': `Bearer ${tk}`,
    'Content-Type': 'application/json',
    ...(opts.headers || {}),
  };
  const res = await fetch(url, { ...opts, headers });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`microsoft.graph ${opts.method || 'GET'} ${pathOrUrl}: ${res.status} — ${txt.slice(0, 400)}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

// ─── Mapeos Graph → shape común de Maria ─────────────────────────────────

function _eventoFromGraph(g) {
  return {
    id: g.id,
    summary: g.subject,
    descripcion: g.bodyPreview || (g.body && g.body.content) || null,
    ubicacion: g.location && g.location.displayName,
    start: g.start && g.start.dateTime ? (g.start.timeZone === 'UTC' ? g.start.dateTime + 'Z' : g.start.dateTime) : null,
    end:   g.end   && g.end.dateTime   ? (g.end.timeZone   === 'UTC' ? g.end.dateTime   + 'Z' : g.end.dateTime)   : null,
    allDay: !!g.isAllDay,
    attendees: (g.attendees || []).map(a => ({ email: a.emailAddress && a.emailAddress.address, nombre: a.emailAddress && a.emailAddress.name })),
    raw: g,
  };
}

function _payloadToGraph(payload) {
  const ev = {
    subject: payload.summary || '(sin título)',
    start: { dateTime: payload.start, timeZone: 'UTC' },
    end:   { dateTime: payload.end,   timeZone: 'UTC' },
  };
  if (payload.descripcion) ev.body = { contentType: 'Text', content: payload.descripcion };
  if (payload.ubicacion) ev.location = { displayName: payload.ubicacion };
  if (Array.isArray(payload.attendees) && payload.attendees.length) {
    ev.attendees = payload.attendees.map(a => {
      const email = typeof a === 'string' ? a : a && a.email;
      return { emailAddress: { address: email }, type: 'required' };
    });
  }
  return ev;
}

// ─── CalendarProvider interface ──────────────────────────────────────────

async function getContext(usuario) {
  if (!usuario || !usuario.id) {
    throw new Error('microsoft.getContext: usuario requerido');
  }
  // Lazy: probamos getAccessToken una vez para validar que las creds andan.
  await _getAccessToken(usuario);
  return { kind: 'microsoft', usuario };
}

async function listarEventosProximos(ctx, opts = {}) {
  const dias = opts.dias || 14;
  const desde = new Date();
  const hasta = new Date(desde.getTime() + dias * 86400000);
  const path = `/me/calendar/calendarView?startDateTime=${desde.toISOString()}&endDateTime=${hasta.toISOString()}&$top=100&$orderby=start/dateTime`;
  const data = await _graphFetch(ctx.usuario, path);
  return (data.value || []).map(_eventoFromGraph);
}

async function listarEventosDelUsuario(ctx, usuario, opts = {}) {
  return listarEventosProximos(ctx, opts);
}

async function crearEvento(ctx, payload) {
  const body = _payloadToGraph(payload);
  const data = await _graphFetch(ctx.usuario, '/me/calendar/events', {
    method: 'POST', body: JSON.stringify(body),
  });
  return _eventoFromGraph(data);
}

async function obtenerEvento(ctx, opts) {
  const id = opts.id;
  if (!id) throw new Error('microsoft.obtenerEvento: id requerido');
  const data = await _graphFetch(ctx.usuario, `/me/events/${encodeURIComponent(id)}`);
  return _eventoFromGraph(data);
}

async function modificarEvento(ctx, payload) {
  const id = payload.id;
  if (!id) throw new Error('microsoft.modificarEvento: id requerido');
  const patch = {};
  if (payload.summary != null)     patch.subject = payload.summary;
  if (payload.start)               patch.start = { dateTime: payload.start, timeZone: 'UTC' };
  if (payload.end)                 patch.end   = { dateTime: payload.end,   timeZone: 'UTC' };
  if (payload.descripcion != null) patch.body = { contentType: 'Text', content: payload.descripcion };
  if (payload.ubicacion != null)   patch.location = { displayName: payload.ubicacion };
  const data = await _graphFetch(ctx.usuario, `/me/events/${encodeURIComponent(id)}`, {
    method: 'PATCH', body: JSON.stringify(patch),
  });
  return _eventoFromGraph(data);
}

async function borrarEvento(ctx, opts) {
  const id = opts.id;
  if (!id) throw new Error('microsoft.borrarEvento: id requerido');
  await _graphFetch(ctx.usuario, `/me/events/${encodeURIComponent(id)}`, { method: 'DELETE' });
  return { id, borrado: true };
}

async function buscarConflictos(ctx, opts) {
  const { start, end, excluirEventoId } = opts;
  const path = `/me/calendar/calendarView?startDateTime=${start}&endDateTime=${end}&$top=50`;
  const data = await _graphFetch(ctx.usuario, path);
  const eventos = (data.value || []).map(_eventoFromGraph);
  return eventos.filter(e => {
    if (excluirEventoId && e.id === excluirEventoId) return false;
    return e.start && e.end;
  });
}

async function listarCalendarios(ctx) {
  const data = await _graphFetch(ctx.usuario, '/me/calendars');
  return (data.value || []).map(c => ({
    id: c.id,
    summary: c.name,
    primary: !!c.isDefaultCalendar,
    accessRole: c.canEdit ? 'owner' : 'reader',
  }));
}

async function chequearAccesoCalendar(ctx, calendarId) {
  const cals = await listarCalendarios(ctx);
  const m = cals.find(c => c.id === calendarId);
  if (!m) return 'none';
  return m.accessRole === 'owner' ? 'write' : 'read';
}

// ─── No-aplica / delegación a Google ─────────────────────────────────────

async function aceptarCalendarShare(_ctx, _calendarId) {
  return { accepted: true, motivo: 'microsoft no usa shares al estilo Google — el user opera con su propia cuenta' };
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
  kind: 'microsoft',
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
  // Helpers públicos para el onboarding flow (used by executor)
  nuevoPkcePair,
  buildAuthUrl,
  intercambiarCodePorTokens,
};
