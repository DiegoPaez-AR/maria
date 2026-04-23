// usuarios.js — registro y resolver de usuarios de Maria
//
// Maria es una sola instancia (un WA, un gmail) que sirve a varios usuarios.
// Este módulo es la única fuente de verdad sobre QUIÉN es el usuario detrás
// de un mensaje entrante, y cuáles son sus credenciales/preferencias
// (calendar_id, tz, rol).
//
// Sólo el `owner` puede crear o borrar usuarios (gateo en executor.js).

const mem = require('./memory');
const db  = mem.db;

// ─── Queries ─────────────────────────────────────────────────────────────

const qTodos         = db.prepare(`SELECT * FROM usuarios WHERE activo = 1 ORDER BY id ASC`);
const qTodosIncl     = db.prepare(`SELECT * FROM usuarios ORDER BY id ASC`);
const qPorId         = db.prepare(`SELECT * FROM usuarios WHERE id = ?`);
const qPorNombre     = db.prepare(`SELECT * FROM usuarios WHERE nombre = ? COLLATE NOCASE AND activo = 1`);
const qPorWaLid      = db.prepare(`SELECT * FROM usuarios WHERE wa_lid = ? AND activo = 1`);
const qPorWaCus      = db.prepare(`SELECT * FROM usuarios WHERE wa_cus = ? AND activo = 1`);
const qPorEmail      = db.prepare(`SELECT * FROM usuarios WHERE email = ? COLLATE NOCASE AND activo = 1`);
const qOwner         = db.prepare(`SELECT * FROM usuarios WHERE rol = 'owner' AND activo = 1 LIMIT 1`);

const insertUsuario = db.prepare(`
  INSERT INTO usuarios (nombre, wa_lid, wa_cus, email, calendar_id, rol, tz, brief_hora, brief_minuto, activo)
  VALUES (@nombre, @wa_lid, @wa_cus, @email, @calendar_id, @rol, @tz, @brief_hora, @brief_minuto, 1)
`);
const updateUsuarioWaLid = db.prepare(`
  UPDATE usuarios SET wa_lid = ?, actualizado = CURRENT_TIMESTAMP WHERE id = ?
`);
const updateUsuarioActivo = db.prepare(`
  UPDATE usuarios SET activo = ?, actualizado = CURRENT_TIMESTAMP WHERE id = ?
`);

// ─── Listado / búsqueda ──────────────────────────────────────────────────

function listarActivos() { return qTodos.all(); }
function listarTodos()   { return qTodosIncl.all(); }

function obtener(id) { return qPorId.get(id) || null; }
function obtenerOwner() { return qOwner.get() || null; }

function esOwner(usuarioId) {
  const u = obtener(usuarioId);
  return !!(u && u.rol === 'owner' && u.activo);
}

// ─── Resolvers ───────────────────────────────────────────────────────────

/**
 * Resuelve un usuario a partir del `from` de un mensaje de WhatsApp.
 * Un `from` puede ser `<num>@c.us` (legacy) o `<lid>@lid` (moderno). Probamos
 * primero wa_lid, después wa_cus.
 */
function resolverPorWa(from) {
  if (!from) return null;
  if (from.endsWith('@lid')) {
    const u = qPorWaLid.get(from);
    if (u) return u;
  }
  if (from.endsWith('@c.us')) {
    const u = qPorWaCus.get(from);
    if (u) return u;
  }
  // Intento cruzado por las dudas
  return qPorWaLid.get(from) || qPorWaCus.get(from) || null;
}

/**
 * Resuelve un usuario a partir del header `From:` de un email.
 * Acepta "Nombre <email@x>" o "email@x" y matchea por email.
 */
function resolverPorEmailFrom(fromHeader) {
  if (!fromHeader) return null;
  const m = String(fromHeader).match(/<([^>]+)>/);
  const email = (m ? m[1] : String(fromHeader)).trim().toLowerCase();
  if (!email) return null;
  return qPorEmail.get(email) || null;
}

function resolverPorNombre(nombre) {
  if (!nombre) return null;
  return qPorNombre.get(nombre) || null;
}

// ─── Mutaciones ──────────────────────────────────────────────────────────

/**
 * Capturar/actualizar el wa_lid de un usuario cuando finalmente escribe por WA.
 */
function setWaLid(usuarioId, waLid) {
  if (!usuarioId || !waLid) return;
  updateUsuarioWaLid.run(waLid, usuarioId);
}

/**
 * Crear un usuario nuevo. Llamado desde executor.crear_usuario (solo owner).
 *
 * Validaciones: nombre obligatorio y único; calendar_id obligatorio (cada
 * usuario comparte su Google Calendar con el gmail de Maria, y ese id queda
 * acá). wa_cus O email son recomendados para routing entrante, pero no
 * obligatorios (puede llegar solo por uno u otro).
 */
function crear({ nombre, wa_cus = null, email = null, calendar_id, tz = null, brief_hora = null, brief_minuto = null }) {
  if (!nombre) throw new Error('crear usuario: nombre requerido');
  if (!calendar_id) throw new Error('crear usuario: calendar_id requerido (cada usuario comparte su calendar con maria.paez.secre@gmail.com)');

  // Normalizar
  const nombreN = nombre.trim();
  const waN    = wa_cus ? (wa_cus.endsWith('@c.us') ? wa_cus : `${String(wa_cus).replace(/\D/g,'')}@c.us`) : null;
  const emailN = email ? email.trim().toLowerCase() : null;

  // Chequear duplicados antes de INSERT (mejor error)
  if (qPorNombre.get(nombreN))      throw new Error(`ya existe un usuario con ese nombre: ${nombreN}`);
  if (waN && qPorWaCus.get(waN))    throw new Error(`ya existe un usuario con ese WhatsApp: ${waN}`);
  if (emailN && qPorEmail.get(emailN)) throw new Error(`ya existe un usuario con ese email: ${emailN}`);

  const info = insertUsuario.run({
    nombre: nombreN,
    wa_lid: null,   // se captura cuando el usuario escribe por primera vez
    wa_cus: waN,
    email: emailN,
    calendar_id,
    rol: 'usuario',
    tz: tz || 'America/Argentina/Buenos_Aires',
    brief_hora: brief_hora || '07',
    brief_minuto: brief_minuto || '00',
  });
  return obtener(info.lastInsertRowid);
}

/**
 * Desactivar un usuario (soft delete). Llamado desde executor.borrar_usuario.
 * NO se puede borrar al owner.
 */
function desactivar(usuarioId) {
  const u = obtener(usuarioId);
  if (!u) throw new Error(`usuario id=${usuarioId} no existe`);
  if (u.rol === 'owner') throw new Error('no se puede borrar al owner');
  updateUsuarioActivo.run(0, usuarioId);
  return u;
}

module.exports = {
  listarActivos,
  listarTodos,
  obtener,
  obtenerOwner,
  esOwner,
  resolverPorWa,
  resolverPorEmailFrom,
  resolverPorNombre,
  setWaLid,
  crear,
  desactivar,
};
