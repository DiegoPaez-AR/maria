// providers/index.js — factory que dado un usuario devuelve el CalendarProvider
// correcto según usuarios.calendar_provider.
//
// Uso típico:
//   const provider = await providers.forUser(usuario);
//   await provider.crearEvento({ ... });
//   await provider.chequearAccesoCalendar(calId);
//
// El objeto devuelto es un "bound provider" — cada método llama internamente
// con el `ctx` resuelto para ese usuario. El consumidor no se preocupa por
// el ctx ni por qué provider está usando.
//
// En Fase 1 sólo está implementado Google; Microsoft y CalDAV se agregan
// en Fase 2/3 sin cambiar la interface pública de este módulo.

const googleProvider = require('./google');

function _resolverProvider(usuario) {
  const kind = (usuario && usuario.calendar_provider) || 'google';
  switch (kind) {
    case 'google':
      return googleProvider;
    case 'microsoft':
      throw new Error(`provider 'microsoft' no implementado todavía (Fase 2)`);
    case 'caldav':
      throw new Error(`provider 'caldav' no implementado todavía (Fase 3)`);
    default:
      throw new Error(`calendar_provider desconocido "${kind}" para usuario ${usuario && usuario.id}`);
  }
}

/**
 * Devuelve un "bound provider" para un usuario. Cada método se llama sin
 * pasar `ctx` — internamente se resuelve y se cachea.
 */
async function forUser(usuario) {
  const provider = _resolverProvider(usuario);
  const ctx = await provider.getContext(usuario);
  // Bound dispatcher: cada función toma sus args y los pasa con el ctx delante.
  const bound = {};
  for (const [name, fn] of Object.entries(provider)) {
    if (typeof fn !== 'function' || name === 'getContext') continue;
    bound[name] = (...args) => fn(ctx, ...args);
  }
  bound.kind = provider.kind;
  bound.usuario = usuario;
  return bound;
}

/**
 * Provider sin usuario asociado. Útil para call sites que no tienen un usuario
 * en scope (ej. listarCumples del calendar de Maria, getMariaCalendarId).
 * Siempre devuelve el provider Google (es el calendar propio de Maria).
 */
async function forMaria() {
  const provider = googleProvider;
  const ctx = await provider.getContext(null);
  const bound = {};
  for (const [name, fn] of Object.entries(provider)) {
    if (typeof fn !== 'function' || name === 'getContext') continue;
    bound[name] = (...args) => fn(ctx, ...args);
  }
  bound.kind = provider.kind;
  return bound;
}

module.exports = { forUser, forMaria };
