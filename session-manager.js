// session-manager.js — sesiones persistentes de conversación con la CLI
//
// Por qué existe: hoy cada mensaje re-manda el prompt entero (~28k tokens)
// y la API lo re-procesa. Con `claude --resume <session_id>` el historial de
// la sesión (reglas + contexto inicial + turnos previos) queda en el prompt
// cache de la API y cada turno nuevo paga solo el delta. Este módulo guarda
// el mapping usuario → sesión viva en estado_usuario (clave `claude_sesion`)
// y decide cuándo rotar (sesión vieja, demasiados turnos, o el system cambió
// por un deploy → la sesión vieja tiene reglas viejas).
//
// Killswitch general: MARIA_SESIONES=1 lo prende en los handlers (default
// APAGADO — los handlers ni tocan este módulo si no está seteado).

const crypto = require('crypto');
const mem = require('./memory');

const CLAVE_SESION = 'claude_sesion';

// Tuning sin deploy via env de la instancia (.conf). Se leen en cada llamada
// para que un pm2 restart con .conf nuevo alcance (mismo criterio que los
// _envInt de prompt-builder).
const _envInt = (k, def) => {
  const v = parseInt(process.env[k], 10);
  return Number.isFinite(v) ? v : def;
};

/** Sesión guardada del usuario: { id, turnos, creada, promptHash } o null. */
function getSesion(usuarioId) {
  const v = mem.getEstadoUsuario(usuarioId, CLAVE_SESION);
  // resetSesion guarda '' (no borra la fila) — lo tratamos como "sin sesión".
  if (!v || typeof v !== 'object' || !v.id) return null;
  return v;
}

function guardarSesion(usuarioId, { id, turnos, creada, promptHash }) {
  mem.setEstadoUsuario(usuarioId, CLAVE_SESION, { id, turnos, creada, promptHash });
}

function resetSesion(usuarioId) {
  mem.setEstadoUsuario(usuarioId, CLAVE_SESION, '');
}

/**
 * ¿Hay que abandonar esta sesión y arrancar una nueva?
 * - turnos >= MARIA_SESION_MAX_TURNOS (default 30): el historial acumulado
 *   ya pesa más de lo que ahorra el cache.
 * - creada hace más de MARIA_SESION_MAX_DIAS (default 7) días: contexto rancio.
 * - promptHash distinto al actual: hubo deploy que cambió el system → la
 *   sesión vieja quedó con reglas viejas, no se puede seguir resumiendo.
 */
function debeRotar(sesion, promptHashActual) {
  if (!sesion) return false;
  const maxTurnos = _envInt('MARIA_SESION_MAX_TURNOS', 30);
  if ((sesion.turnos || 0) >= maxTurnos) return true;
  const maxDias = _envInt('MARIA_SESION_MAX_DIAS', 7);
  const creadaMs = Date.parse(sesion.creada || '');
  if (!Number.isFinite(creadaMs) || (Date.now() - creadaMs) > maxDias * 86400000) return true;
  if (promptHashActual && sesion.promptHash !== promptHashActual) return true;
  return false;
}

// ─── Mutex por usuario ────────────────────────────────────────────────────
// Dos turnos concurrentes del mismo usuario NO pueden resumir la misma
// sesión en paralelo: forkearían la historia (cada uno continuaría desde el
// mismo punto y el session_id resultante de uno pisaría al del otro,
// perdiendo un turno entero de contexto). Serializamos con una cadena de
// promesas por usuario; usuarios distintos no se bloquean entre sí.
const _locks = new Map();

function lockUsuario(usuarioId, fn) {
  const prev = _locks.get(usuarioId) || Promise.resolve();
  // Encadenamos SIEMPRE sobre la anterior, falle o no — un turno que explotó
  // no puede dejar trabada la cola del usuario.
  const cur = prev.then(() => fn(), () => fn());
  // El tail guardado traga errores (el caller los ve via `cur`) y se limpia
  // del Map cuando nadie más se encadenó detrás.
  const tail = cur.then(() => {}, () => {}).then(() => {
    if (_locks.get(usuarioId) === tail) _locks.delete(usuarioId);
  });
  _locks.set(usuarioId, tail);
  return cur;
}

/** Hash corto del system prompt — detecta deploys que cambian las reglas. */
function promptHashDe(systemTxt) {
  return crypto.createHash('sha256').update(String(systemTxt || ''), 'utf8').digest('hex').slice(0, 16);
}

module.exports = {
  getSesion,
  guardarSesion,
  resetSesion,
  debeRotar,
  lockUsuario,
  promptHashDe,
};
