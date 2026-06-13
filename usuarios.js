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
// Match de identidad contra usuarios DESACTIVADOS (para reactivación en crear()).
const qInactivoMatch = db.prepare(`
  SELECT * FROM usuarios WHERE activo = 0 AND (
    (@cus IS NOT NULL AND wa_cus = @cus) OR
    (@lid IS NOT NULL AND wa_lid = @lid) OR
    (@email IS NOT NULL AND email = @email) OR
    nombre = @nombre COLLATE NOCASE
  ) LIMIT 1
`);
const reactivarStmt = db.prepare(`UPDATE usuarios SET activo = 1 WHERE id = ?`);
const qPorWaLid      = db.prepare(`SELECT * FROM usuarios WHERE wa_lid = ? AND activo = 1`);
const qPorWaCus      = db.prepare(`SELECT * FROM usuarios WHERE wa_cus = ? AND activo = 1`);
const qPorEmail      = db.prepare(`SELECT * FROM usuarios WHERE email = ? COLLATE NOCASE AND activo = 1`);
const qOwner         = db.prepare(`SELECT * FROM usuarios WHERE rol = 'owner' AND activo = 1 LIMIT 1`);

const insertUsuario = db.prepare(`
  INSERT INTO usuarios (nombre, wa_lid, wa_cus, email, calendar_id, rol, tz, brief_hora, brief_minuto, ubicacion, activo)
  VALUES (@nombre, @wa_lid, @wa_cus, @email, @calendar_id, @rol, @tz, @brief_hora, @brief_minuto, @ubicacion, 1)
`);
const updateUsuarioWaLid = db.prepare(`
  UPDATE usuarios SET wa_lid = ?, actualizado = CURRENT_TIMESTAMP WHERE id = ?
`);
const updateUsuarioActivo = db.prepare(`
  UPDATE usuarios SET activo = ?, actualizado = CURRENT_TIMESTAMP WHERE id = ?
`);
const updateBriefActivo = db.prepare(`
  UPDATE usuarios SET brief_activo = ?, actualizado = CURRENT_TIMESTAMP WHERE id = ?
`);
const updateUbicacionCoords = db.prepare(`
  UPDATE usuarios SET lat = ?, lon = ?, actualizado = CURRENT_TIMESTAMP WHERE id = ?
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
// Genera variantes alternativas para resolver el "9 móvil argentino":
// WhatsApp a veces entrega `54 9 11 XXXXXX@c.us` (con 9) y a veces
// `54 11 XXXXXX@c.us` (sin 9), y el wa_cus guardado puede estar en
// cualquiera de los dos formatos. Solo se aplica a números que empiezan
// con `54` (Argentina); el resto pasa de largo.
function _variantesArMobile(waCus) {
  const m = waCus.match(/^54(9)?(\d+)@c\.us$/);
  if (!m) return [];
  if (m[1] === '9') {
    return [`54${m[2]}@c.us`];   // tiene 9 → probar sin
  }
  return [`549${m[2]}@c.us`];     // no tiene 9 → probar con
}

function resolverPorWa(from) {
  if (!from) return null;
  if (from.endsWith('@lid')) {
    const u = qPorWaLid.get(from);
    if (u) return u;
  }
  if (from.endsWith('@c.us')) {
    let u = qPorWaCus.get(from);
    if (u) return u;
    // Fallback AR: probar la variante con/sin el 9 móvil.
    for (const v of _variantesArMobile(from)) {
      u = qPorWaCus.get(v);
      if (u) return u;
    }
  }
  // Intento cruzado por las dudas
  const cruz = qPorWaLid.get(from) || qPorWaCus.get(from);
  if (cruz) return cruz;
  // Fallback final: match por sufijo de digitos (>=8). Cubre wa_cus guardado
  // en otra representacion que la que llega (54 11... vs 54 9 11..., con/sin
  // codigo de pais). No aplica a @lid: sus digitos no son telefonicos.
  return _resolverPorDigitos(from);
}

// Match por sufijo de digitos contra el wa_cus de los usuarios. Ultima red
// de la resolucion de identidad WA.
function _resolverPorDigitos(from) {
  if (!from || String(from).endsWith('@lid')) return null;
  const d = String(from).replace(/\D/g, '');
  if (d.length < 8) return null;
  for (const u of qTodosIncl.all()) {
    if (!u.wa_cus) continue;
    const dc = String(u.wa_cus).replace(/\D/g, '');
    if (dc.length >= 8 && (dc.endsWith(d) || d.endsWith(dc))) return u;
  }
  return null;
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
 * Validaciones: nombre obligatorio y único. calendar_id es RECOMENDADO pero
 * opcional (un "prospecto" puede existir antes de compartir su calendario;
 * se completa después con `actualizar`). wa_cus O email son recomendados
 * para routing entrante, pero no obligatorios (puede llegar solo por uno u
 * otro, o por ninguno si aún no contactó).
 *
 * Nota: crear_evento en executor.js ya verifica que el usuario tenga
 * calendar_id antes de crear eventos — si un prospecto sin calendar_id
 * pide algo que requiere calendario, falla ahí con mensaje claro.
 */
// Normaliza un identificador WA crudo (string que puede venir del LLM o de
// un humano) a `{ wa_lid, wa_cus }`. Reglas:
//   - termina en "@lid" → es un Linked ID → wa_lid
//   - termina en "@c.us" → es un número telefónico WA → wa_cus
//   - sin sufijo → asumimos número telefónico → "<digitos>@c.us" (legacy)
// Si el caller pasa explícitamente wa_lid y wa_cus por separado, los
// respetamos. Si pasa un único valor `wa_cus` que en realidad es un LID,
// lo derivamos. Esto evita el bug histórico donde crear_usuario con un
// LID terminaba guardando "<digitos>@c.us" inválido.
function _normalizarWaIds({ wa_lid, wa_cus }) {
  let lid = wa_lid || null;
  let cus = wa_cus || null;
  if (cus && typeof cus === 'string') {
    const trimmed = cus.trim();
    if (trimmed.endsWith('@lid')) {
      // Vino un LID en el slot de wa_cus → derivar (si no había wa_lid).
      if (!lid) lid = trimmed;
      cus = null;
    } else if (trimmed.endsWith('@c.us')) {
      cus = trimmed;
    } else if (trimmed.length) {
      cus = `${trimmed.replace(/\D/g,'')}@c.us`;
      if (!cus.match(/^\d+@c\.us$/)) cus = null; // si quedó solo "@c.us" descartar
    } else {
      cus = null;
    }
  }
  if (lid && typeof lid === 'string') {
    const t = lid.trim();
    lid = t.endsWith('@lid') ? t : (t.length ? `${t.replace(/\D/g,'')}@lid` : null);
    if (lid && !lid.match(/^\d+@lid$/)) lid = null;
  }
  return { wa_lid: lid, wa_cus: cus };
}

// Anti-homónimos (2026-06-12): comparación de nombres normalizada
// (case, acentos, espacios múltiples). El COLLATE NOCASE de qPorNombre no
// alcanza: "Juan Pérez" vs "Juan Perez" pasaban como distintos, y el nombre
// es la clave de ruteo del unknown-flow — dos usuarios activos homónimos
// rompen el matcheo de terceros.
function _nombreNorm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Usuario ACTIVO cuyo nombre normalizado coincide (excluyendo `exceptoId`). */
function _activoHomonimo(nombre, exceptoId = null) {
  const n = _nombreNorm(nombre);
  if (!n) return null;
  for (const u of listarActivos()) {
    if (exceptoId && u.id === exceptoId) continue;
    if (_nombreNorm(u.nombre) === n) return u;
  }
  return null;
}

function crear({ nombre, wa_lid = null, wa_cus = null, email = null, calendar_id = null, tz = null, brief_hora = null, brief_minuto = null, ubicacion = null }) {
  if (!nombre) throw new Error('crear usuario: nombre requerido');

  // Normalizar
  const nombreN = nombre.trim();
  const { wa_lid: lidN, wa_cus: cusN } = _normalizarWaIds({ wa_lid, wa_cus });
  const emailN = email ? email.trim().toLowerCase() : null;
  const calN   = calendar_id ? String(calendar_id).trim().toLowerCase() : null;

  // Anti-homónimos: nunca dos usuarios ACTIVOS con el mismo nombre. Va ANTES
  // de la reactivación para que reactivar un dado-de-baja tampoco pueda crear
  // un duplicado de nombre con un activo.
  const homonimo = _activoHomonimo(nombreN);
  if (homonimo) {
    throw new Error(`ya existe un usuario activo con ese nombre: "${homonimo.nombre}" (id=${homonimo.id}). No se permiten homónimos — usá un nombre que lo distinga (apellido, segundo nombre o apodo).`);
  }

  // Reactivación (2026-06-11): si la identidad matchea un usuario DESACTIVADO,
  // lo reactivamos con su historial intacto en vez de explotar con
  // SQLITE_CONSTRAINT (los UNIQUE de la tabla son globales, los prechecks de
  // abajo solo miran activo=1). El caller ve `reactivado: true` en el retorno.
  const inactivo = qInactivoMatch.get({ cus: cusN, lid: lidN, email: emailN, nombre: nombreN });
  if (inactivo) {
    reactivarStmt.run(inactivo.id);
    const patch = {};
    if (nombreN) patch.nombre = nombreN;
    if (lidN) patch.wa_lid = lidN;
    if (cusN) patch.wa_cus = cusN;
    if (emailN) patch.email = emailN;
    if (calN) patch.calendar_id = calN;
    if (tz) patch.tz = tz;
    if (brief_hora) patch.brief_hora = brief_hora;
    if (brief_minuto) patch.brief_minuto = brief_minuto;
    if (ubicacion && String(ubicacion).trim()) patch.ubicacion = String(ubicacion).trim();
    if (Object.keys(patch).length) actualizar(inactivo.id, patch);
    const u = obtener(inactivo.id);
    u.reactivado = true;
    console.log(`[usuarios] reactivado ${u.nombre} (id=${u.id}) — estaba dado de baja, vuelve con su historial`);
    return u;
  }

  // Chequear duplicados antes de INSERT (mejor error)
  if (lidN && qPorWaLid.get(lidN))     throw new Error(`ya existe un usuario con ese WhatsApp LID: ${lidN}`);
  if (cusN && qPorWaCus.get(cusN))     throw new Error(`ya existe un usuario con ese WhatsApp: ${cusN}`);
  if (emailN && qPorEmail.get(emailN)) throw new Error(`ya existe un usuario con ese email: ${emailN}`);

  const info = insertUsuario.run({
    nombre: nombreN,
    wa_lid: lidN,
    wa_cus: cusN,
    email: emailN,
    calendar_id: calN,
    rol: 'usuario',
    tz: tz || 'America/Argentina/Buenos_Aires',
    brief_hora: brief_hora || '07',
    brief_minuto: brief_minuto || '00',
    ubicacion: (ubicacion && String(ubicacion).trim()) ? String(ubicacion).trim() : null,
  });
  return obtener(info.lastInsertRowid);
}

// ─── Actualizar campos parciales ────────────────────────────────────────
//
// Patch de usuario: sólo los campos que pasás. Útil para completar datos
// de un prospecto creado "a medias" (ej. agregar calendar_id cuando
// finalmente lo comparte, o capturar el email después).
//
// No permite cambiar id, rol ni activo por acá (para rol/activo usar
// helpers específicos).

const CAMPOS_ACTUALIZABLES = new Set([
  'nombre', 'wa_lid', 'wa_cus', 'email', 'calendar_id', 'tz', 'brief_hora', 'brief_minuto', 'ubicacion',
  // Multi-provider calendar (F2/F3): sin estos tres, configurar_caldav /
  // configurar_microsoft y la rotación del refresh_token de MS se descartan
  // en silencio (fix 2026-06-09).
  'calendar_provider', 'calendar_auth_json', 'calendar_acceso',
]);

function actualizar(id, patch = {}) {
  const u = obtener(id);
  if (!u) throw new Error(`actualizar usuario: id=${id} no existe`);
  const cambios = {};
  for (const [k, v] of Object.entries(patch)) {
    if (!CAMPOS_ACTUALIZABLES.has(k)) continue;
    if (v === undefined) continue;
    cambios[k] = v;
  }
  // Normalizaciones
  if (cambios.nombre !== undefined) cambios.nombre = String(cambios.nombre).trim();
  if (cambios.email  !== undefined && cambios.email != null) cambios.email = String(cambios.email).trim().toLowerCase();
  if (cambios.calendar_id !== undefined && cambios.calendar_id != null) cambios.calendar_id = String(cambios.calendar_id).trim().toLowerCase();
  // Si cambia la ubicacion: normalizar y limpiar el cache lat/lon (se vuelve a
  // geocodificar en la proxima corrida del brief contra la ciudad nueva).
  if (cambios.ubicacion !== undefined) {
    cambios.ubicacion = (cambios.ubicacion && String(cambios.ubicacion).trim()) ? String(cambios.ubicacion).trim() : null;
    cambios.lat = null;
    cambios.lon = null;
  }
  // Normalizar wa_lid / wa_cus juntos: si el caller pasa "X@lid" como
  // wa_cus por error, _normalizarWaIds lo deriva al slot correcto.
  if (cambios.wa_lid !== undefined || cambios.wa_cus !== undefined) {
    const norm = _normalizarWaIds({
      wa_lid: cambios.wa_lid !== undefined ? cambios.wa_lid : u.wa_lid,
      wa_cus: cambios.wa_cus !== undefined ? cambios.wa_cus : u.wa_cus,
    });
    if (cambios.wa_lid !== undefined) cambios.wa_lid = norm.wa_lid;
    if (cambios.wa_cus !== undefined) cambios.wa_cus = norm.wa_cus;
  }

  // Chequear conflictos de unicidad (en otro usuario distinto)
  if (cambios.nombre) {
    const otro = _activoHomonimo(cambios.nombre, id);
    if (otro) throw new Error(`ya existe otro usuario activo con ese nombre: "${otro.nombre}" (id=${otro.id}). No se permiten homónimos — usá un nombre que lo distinga (apellido, segundo nombre o apodo).`);
  }
  if (cambios.wa_lid) {
    const otro = qPorWaLid.get(cambios.wa_lid);
    if (otro && otro.id !== id) throw new Error(`ya existe otro usuario con ese WhatsApp LID: ${cambios.wa_lid}`);
  }
  if (cambios.wa_cus) {
    const otro = qPorWaCus.get(cambios.wa_cus);
    if (otro && otro.id !== id) throw new Error(`ya existe otro usuario con ese WhatsApp: ${cambios.wa_cus}`);
  }
  if (cambios.email) {
    const otro = qPorEmail.get(cambios.email);
    if (otro && otro.id !== id) throw new Error(`ya existe otro usuario con ese email: ${cambios.email}`);
  }

  const keys = Object.keys(cambios);
  if (!keys.length) return u;
  const setClause = keys.map(k => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE usuarios SET ${setClause}, actualizado = CURRENT_TIMESTAMP WHERE id = @id`)
    .run({ ...cambios, id });
  return obtener(id);
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
  // 2026-06-11: sus envíos diferidos y follow-ups no deben salir igual
  // (antes los programados de un desactivado se despachaban lo mismo).
  try {
    const mem = require('./memory'); // lazy: evita ciclo de require
    const r = mem.cancelarPendientesDeUsuario(usuarioId);
    if (r.programados || r.followUps) {
      console.log(`[usuarios] desactivado ${u.nombre}: cancelados ${r.programados} programado(s) y ${r.followUps} follow-up(s)`);
    }
  } catch (e) {
    console.warn(`[usuarios] desactivar ${u.nombre}: no pude cancelar pendientes:`, e.message);
  }
  return u;
}

// ─── Cap de usuarios por instancia ───────────────────────────────────────
//
// Una instancia puede limitar la cantidad de usuarios activos que atiende.
// El owner cuenta como un slot. Si el cap es 10, podés tener owner + 9.
// Sin cap = ilimitado (default).

const MAX_USUARIOS = process.env.ASISTENTE_MAX_USUARIOS
  ? Number(process.env.ASISTENTE_MAX_USUARIOS)
  : null;

const qCount = db.prepare(`SELECT COUNT(*) AS n FROM usuarios WHERE activo = 1`);

function cantidadActivos() {
  return qCount.get().n;
}

function maxUsuarios() {
  return MAX_USUARIOS;
}

function puedeCrearMas() {
  if (MAX_USUARIOS == null) return true;
  return cantidadActivos() < MAX_USUARIOS;
}

// ─── Tiers de calendar ───────────────────────────────────────────────────
//
// Devuelve el tier (0/1/2) que tiene un usuario según su calendar_id +
// calendar_acceso. Usado por brief, meeting-prep, y crear/modificar/borrar
// evento para decidir contra qué calendar trabajar.
//
//   tier_0 (none)  → Maria crea en su propio calendar e invita al user.
//   tier_1 (read)  → puede chequear conflictos en calendar del user, pero
//                    crea/modifica/borra solo eventos propios. Eventos del
//                    user con organizer ≠ Maria son read-only.
//   tier_2 (write) → autonomía total contra el calendar del user.
function tier(usuario) {
  if (!usuario) return 'tier_0';
  const acc = usuario.calendar_acceso;
  if (acc === 'write' && usuario.calendar_id) return 'tier_2';
  if (acc === 'read'  && usuario.calendar_id) return 'tier_1';
  return 'tier_0';
}

// Setea el campo calendar_acceso. No valida acceso real — eso lo hace el
// caller con una llamada de prueba al calendar correspondiente.
const updateCalendarAcceso = db.prepare(`
  UPDATE usuarios SET calendar_acceso = ?, actualizado = CURRENT_TIMESTAMP WHERE id = ?
`);
function setearCalendarAcceso(usuarioId, modo) {
  if (!['none', 'read', 'write'].includes(modo)) {
    throw new Error(`setearCalendarAcceso: modo inválido "${modo}" — usar none|read|write`);
  }
  updateCalendarAcceso.run(modo, usuarioId);
}

// Opt-out del morning-brief. activo truthy -> 1 (recibe), falsy -> 0 (no recibe).
function setBriefActivo(usuarioId, activo) {
  if (!obtener(usuarioId)) throw new Error(`setBriefActivo: usuario id=${usuarioId} no existe`);
  updateBriefActivo.run(activo ? 1 : 0, usuarioId);
  return obtener(usuarioId);
}

// Cachea el lat/lon geocodificado de la ubicacion del usuario. Lo llama el
// morning-brief tras resolver la ciudad con Open-Meteo, para no geocodificar
// en cada corrida. No valida — confia en el geocoder.
function setUbicacionCoords(usuarioId, lat, lon) {
  if (!usuarioId) return null;
  updateUbicacionCoords.run(lat == null ? null : lat, lon == null ? null : lon, usuarioId);
  return obtener(usuarioId);
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
  actualizar,
  desactivar,
  tier,
  setearCalendarAcceso,
  setBriefActivo,
  setUbicacionCoords,
  cantidadActivos,
  maxUsuarios,
  puedeCrearMas,
};
