// calendar-watch.js — loop periódico que detecta cambios en el accessRole
// que Maria tiene sobre el calendar de cada usuario.
//
// Por qué existe:
// El user puede compartir/desconectar/cambiar permisos de su calendar
// directamente desde Google Calendar settings, sin avisarle a Maria. Si
// `usuarios.calendar_acceso` queda desactualizado, Maria sigue tratando
// al user en el tier viejo (operaciones que fallan, decisiones de
// agendado erradas).
//
// Cada `CALENDAR_WATCH_MS` (default 8h), recorre los usuarios activos:
//   1) Si `calendar_id` está vacío, salta (nada que chequear).
//   2) Llama a `g.chequearAccesoCalendar(calendar_id)` que devuelve
//      'none' | 'read' | 'write' según el accessRole real.
//   3) Si difiere del valor guardado, lo actualiza y deja un evento de
//      sistema en memoria. El cambio se refleja en el próximo prompt
//      del LLM atendiendo a ese user.
//
// Override por env: CALENDAR_WATCH_MS (en ms).

const loopGuard = require('./loop-guard');
const usuarios = require('./usuarios');
const g = require('./google');
const mem = require('./memory');
const providers = require('./providers');

async function tickUsuario(usuario) {
  if (!usuario.calendar_id) return null;
  let detectado;
  try {
    const provider = await providers.forUser(usuario);
    detectado = await provider.chequearAccesoCalendar(usuario.calendar_id);
    loopGuard.reportar('acceso_google', true);
  } catch (err) {
    console.warn(`[calendar-watch/${usuario.nombre}] chequeo falló: ${err.message}`);
    if (loopGuard.esErrorAccesoGoogle(err)) loopGuard.reportar('acceso_google', false, err);
    return null;
  }
  const actual = usuario.calendar_acceso || 'none';
  if (detectado === actual) return null;

  usuarios.setearCalendarAcceso(usuario.id, detectado);
  console.log(`[calendar-watch/${usuario.nombre}] calendar_acceso ${actual} → ${detectado}`);
  mem.log({
    usuarioId: usuario.id,
    canal: 'sistema', direccion: 'interno',
    cuerpo: `calendar_acceso autodetectado: ${actual} → ${detectado}`,
    metadata: { antes: actual, despues: detectado, fuente: 'calendar-watch' },
  });
  return { antes: actual, despues: detectado };
}

async function tick() {
  const activos = usuarios.listarActivos();
  let cambios = 0;
  for (const u of activos) {
    try {
      const r = await tickUsuario(u);
      if (r) cambios++;
    } catch (err) {
      console.warn(`[calendar-watch/${u.nombre}] tick: ${err.message}`);
    }
  }
  if (cambios > 0) console.log(`[calendar-watch] tick: ${cambios} cambio(s) detectado(s)`);
}

function iniciarCalendarWatch({ intervaloMs = 8 * 60 * 60 * 1000 } = {}) {
  const horas = (intervaloMs / 3600 / 1000).toFixed(1);
  console.log(`[calendar-watch] activo, cada ${horas}h`);
  // Tick inicial al boot — sirve también para detectar cambios entre
  // restarts. Lo corremos async para no bloquear el bootup.
  tick().catch(err => console.error('[calendar-watch] tick inicial:', err.message));
  return setInterval(() => {
    tick().catch(err => console.error('[calendar-watch] tick:', err.message));
  }, intervaloMs);
}

module.exports = { iniciarCalendarWatch, tick };
