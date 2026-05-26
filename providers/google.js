// providers/google.js — implementación del CalendarProvider para Google.
//
// Maria autentica con su propio OAuth (token.json) y opera contra:
//   - Su propio Google Calendar (eventos que crea Maria como tier 0/1).
//   - Calendars de users que le compartieron con la cuenta de Maria (ASISTENTE_FROM_EMAIL)
//     (tier 1 read / tier 2 write).
//
// Este módulo es una capa fina sobre google.js. La idea es que google.js
// siga exponiendo todas las primitivas históricas (compat) y este wrapper
// las exponga con la interface uniforme CalendarProvider para que
// providers/index.js pueda intercambiarlo por microsoft/caldav transparente.
//
// NO se usa `ctx` para Google porque la auth es compartida (única para
// todos los users Google). Se mantiene la firma con `ctx` por consistencia
// con la interface; otros providers (microsoft, caldav) sí lo usan.

const g = require('../google');

async function getContext(/* usuario */) {
  // Google usa OAuth compartido entre todos los users que comparten su
  // calendar con Maria. La autenticación es la misma para todos.
  await g.autenticar();
  return { kind: 'google' };
}

// Eventos
async function listarEventosProximos(ctx, opts)        { return g.listarEventosProximos(opts); }
async function listarEventosDelUsuario(ctx, usuario, opts) { return g.listarEventosDelUsuario(usuario, opts); }
async function crearEvento(ctx, payload)               { return g.crearEvento(payload); }
async function obtenerEvento(ctx, opts)                { return g.obtenerEvento(opts); }
async function modificarEvento(ctx, payload)           { return g.modificarEvento(payload); }
async function borrarEvento(ctx, opts)                 { return g.borrarEvento(opts); }
async function buscarConflictos(ctx, opts)             { return g.buscarConflictos(opts); }

// Calendars
async function listarCalendarios(ctx)                  { return g.listarCalendarios(); }
async function chequearAccesoCalendar(ctx, calendarId) { return g.chequearAccesoCalendar(calendarId); }
async function aceptarCalendarShare(ctx, calendarId)   { return g.aceptarCalendarShare(calendarId); }
async function getMariaCalendarId(ctx)                 { return g.getMariaCalendarId(); }
async function idCalendarioCumples(ctx)                { return g.idCalendarioCumples(); }
async function listarCumples(ctx, opts)                { return g.listarCumples(opts); }

// Links útiles
function linkCrearEventoPrellenado(ctx, opts)          { return g.linkCrearEventoPrellenado(opts); }

module.exports = {
  kind: 'google',
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
