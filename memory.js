// memory.js — capa de persistencia SQLite para Maria (multi-usuario)
//
// Maria es una sola (un WA, un gmail, un proceso) pero sirve a varios usuarios.
// Todo dato operativo (eventos, pendientes, contactos, hechos, programados,
// estado de ciclo) se aísla por `usuario_id`. Maria NUNCA mezcla info entre
// usuarios.
//
// Tablas principales:
//   - usuarios       → registro de cada persona a la que Maria sirve
//   - eventos        → log cross-canal POR USUARIO (mensajes, emails, sistema)
//   - estado         → kv GLOBAL de Maria (ej. 'gmail:procesados')
//   - estado_usuario → kv por usuario (ej. 'morning_brief_ultimo_dia')
//   - contactos      → libreta de cada usuario (nombre único POR usuario)
//   - pendientes     → cola de cosas en el aire de cada usuario
//   - programados    → mensajes diferidos (dispatch global, contenido por usuario)
//   - hechos         → preferencias persistentes (clave única POR usuario)
//
// Migración idempotente: chequea con PRAGMA table_info si cada columna/tabla ya
// existe. En un DB viejo (pre-multiusuario) hace ALTER/recreate y backfill todo
// a usuario_id=1 (Diego). En un DB nuevo crea el schema directo.

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_DIR  = path.join(__dirname, 'db');
const DB_PATH = process.env.MARIA_DB || path.join(DB_DIR, 'maria.sqlite');

if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Env de fallback para el bootstrap inicial (solo si `usuarios` está vacía).
const OWNER_NOMBRE   = process.env.OWNER_NOMBRE   || 'Diego';
const OWNER_WA_CUS   = process.env.DIEGO_WA       || '541132317896@c.us';
const OWNER_EMAIL    = process.env.DIEGO_EMAIL    || 'diego@paez.is';
const OWNER_CAL_ID   = process.env.OWNER_CALENDAR_ID || OWNER_EMAIL;
const OWNER_TZ       = process.env.MARIA_TZ       || 'America/Argentina/Buenos_Aires';

// ─── Schema base (idempotente) ────────────────────────────────────────────

db.exec(`
CREATE TABLE IF NOT EXISTS usuarios (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre       TEXT NOT NULL UNIQUE,
  wa_lid       TEXT UNIQUE,
  wa_cus       TEXT UNIQUE,
  email        TEXT UNIQUE,
  calendar_id  TEXT,
  rol          TEXT NOT NULL DEFAULT 'usuario' CHECK(rol IN ('owner','usuario')),
  tz           TEXT DEFAULT 'America/Argentina/Buenos_Aires',
  brief_hora   TEXT DEFAULT '04',
  brief_minuto TEXT DEFAULT '00',
  activo       INTEGER NOT NULL DEFAULT 1,
  creado       DATETIME DEFAULT CURRENT_TIMESTAMP,
  actualizado  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS eventos (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp      DATETIME DEFAULT CURRENT_TIMESTAMP,
  usuario_id     INTEGER REFERENCES usuarios(id),
  canal          TEXT NOT NULL CHECK(canal IN ('whatsapp','gmail','calendar','sistema')),
  direccion      TEXT NOT NULL CHECK(direccion IN ('entrante','saliente','interno')),
  de             TEXT,
  nombre         TEXT,
  asunto         TEXT,
  cuerpo         TEXT,
  tipo_original  TEXT,
  metadata_json  TEXT
);
CREATE INDEX IF NOT EXISTS idx_eventos_ts       ON eventos(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_eventos_canal_ts ON eventos(canal, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_eventos_de       ON eventos(de);
-- idx_eventos_usuario se crea después de las migraciones (requiere columna usuario_id)

CREATE TABLE IF NOT EXISTS estado (
  clave       TEXT PRIMARY KEY,
  valor_json  TEXT NOT NULL,
  actualizado DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS estado_usuario (
  usuario_id  INTEGER NOT NULL REFERENCES usuarios(id),
  clave       TEXT NOT NULL,
  valor_json  TEXT NOT NULL,
  actualizado DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (usuario_id, clave)
);

CREATE TABLE IF NOT EXISTS programados (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  creado        DATETIME DEFAULT CURRENT_TIMESTAMP,
  usuario_id    INTEGER REFERENCES usuarios(id),
  cuando        TEXT NOT NULL,
  canal         TEXT NOT NULL CHECK(canal IN ('whatsapp','gmail')),
  destino       TEXT NOT NULL,
  asunto        TEXT,
  texto         TEXT NOT NULL,
  enviado       INTEGER NOT NULL DEFAULT 0,
  razon         TEXT,
  metadata_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_prog_cuando  ON programados(cuando, enviado);
CREATE INDEX IF NOT EXISTS idx_prog_razon   ON programados(razon, enviado);
-- idx_prog_usuario se crea después de las migraciones (requiere columna usuario_id)

CREATE TABLE IF NOT EXISTS pendientes (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  creado              DATETIME DEFAULT CURRENT_TIMESTAMP,
  usuario_id          INTEGER REFERENCES usuarios(id),
  desc                TEXT NOT NULL,
  estado              TEXT NOT NULL DEFAULT 'abierto' CHECK(estado IN ('abierto','cerrado','cancelado')),
  cerrado             DATETIME,
  ultimo_recordatorio DATETIME,
  remitente           TEXT,
  canal_origen        TEXT,
  destino_wa          TEXT,
  destino_email       TEXT,
  email_message_id    TEXT,
  meta_json           TEXT
);
CREATE INDEX IF NOT EXISTS idx_pendientes_estado   ON pendientes(estado, creado);
CREATE INDEX IF NOT EXISTS idx_pendientes_remit    ON pendientes(remitente, estado);
-- idx_pendientes_usuario se crea después de las migraciones (requiere columna usuario_id)
`);

// ─── Helpers de introspección ─────────────────────────────────────────────

function _tieneColumna(tabla, col) {
  try {
    const cols = db.prepare(`PRAGMA table_info(${tabla})`).all();
    return cols.some(c => c.name === col);
  } catch { return false; }
}

function _tablaExiste(nombre) {
  const row = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name = ?`).get(nombre);
  return !!row;
}

// ─── Bootstrap del owner ──────────────────────────────────────────────────
// Si no hay ningún owner, creamos uno desde env (primer deploy multiusuario
// o DB nuevo). Lo hacemos ANTES de las migraciones para que el backfill
// (usuario_id=1) tenga FK válida.

function _asegurarOwner() {
  const yaOwner = db.prepare(`SELECT id FROM usuarios WHERE rol = 'owner' LIMIT 1`).get();
  if (yaOwner) return yaOwner.id;
  // Si hay algún usuario pero ninguno es owner (raro), promovemos el de id=1.
  const algunUsuario = db.prepare(`SELECT id FROM usuarios ORDER BY id ASC LIMIT 1`).get();
  if (algunUsuario) {
    db.prepare(`UPDATE usuarios SET rol = 'owner' WHERE id = ?`).run(algunUsuario.id);
    return algunUsuario.id;
  }
  // Crear owner desde env.
  const info = db.prepare(`
    INSERT INTO usuarios (nombre, wa_cus, email, calendar_id, rol, tz, activo)
    VALUES (?, ?, ?, ?, 'owner', ?, 1)
  `).run(OWNER_NOMBRE, OWNER_WA_CUS, OWNER_EMAIL, OWNER_CAL_ID, OWNER_TZ);
  console.log(`[memory] owner creado: ${OWNER_NOMBRE} (id=${info.lastInsertRowid})`);
  return info.lastInsertRowid;
}

const OWNER_ID = _asegurarOwner();

// ─── Migraciones idempotentes ─────────────────────────────────────────────

function _migrarAgregarUsuarioId(tabla) {
  if (_tieneColumna(tabla, 'usuario_id')) return false;
  db.exec(`ALTER TABLE ${tabla} ADD COLUMN usuario_id INTEGER REFERENCES usuarios(id)`);
  db.prepare(`UPDATE ${tabla} SET usuario_id = ? WHERE usuario_id IS NULL`).run(OWNER_ID);
  console.log(`[memory] migración: ${tabla}.usuario_id agregado y backfill → ${OWNER_ID}`);
  return true;
}

// Tablas que ya existían pre-multiusuario y solo les falta usuario_id:
for (const t of ['eventos', 'pendientes', 'programados']) {
  _migrarAgregarUsuarioId(t);
}

// Índices que dependen de usuario_id (los creamos acá porque en el exec inicial
// la columna podía no existir todavía en DBs viejos).
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_eventos_usuario     ON eventos(usuario_id, timestamp DESC);
  CREATE INDEX IF NOT EXISTS idx_prog_usuario        ON programados(usuario_id, enviado);
  CREATE INDEX IF NOT EXISTS idx_pendientes_usuario  ON pendientes(usuario_id, estado, creado);
`);

// `contactos` necesita recreate: el UNIQUE sobre `nombre` pasa a ser por usuario.
function _migrarContactos() {
  if (!_tablaExiste('contactos')) {
    db.exec(`
      CREATE TABLE contactos (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id  INTEGER NOT NULL REFERENCES usuarios(id),
        nombre      TEXT NOT NULL,
        whatsapp    TEXT,
        email       TEXT,
        notas       TEXT,
        creado      DATETIME DEFAULT CURRENT_TIMESTAMP,
        actualizado DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(usuario_id, nombre)
      );
      CREATE INDEX IF NOT EXISTS idx_contactos_whatsapp ON contactos(whatsapp);
      CREATE INDEX IF NOT EXISTS idx_contactos_email    ON contactos(email);
      CREATE INDEX IF NOT EXISTS idx_contactos_usuario  ON contactos(usuario_id, nombre);
    `);
    return;
  }
  // Ya tiene usuario_id y uniqueness compuesto? Si no, recreate.
  const cols = db.prepare(`PRAGMA table_info(contactos)`).all();
  const tieneUsuario = cols.some(c => c.name === 'usuario_id');
  // Detectar uniqueness compuesto inspeccionando los índices.
  const idx = db.prepare(`PRAGMA index_list(contactos)`).all();
  let tieneUniqueCompuesto = false;
  for (const i of idx) {
    if (!i.unique) continue;
    const cols2 = db.prepare(`PRAGMA index_info(${i.name})`).all().map(c => c.name).sort();
    if (cols2.length === 2 && cols2.includes('usuario_id') && cols2.includes('nombre')) {
      tieneUniqueCompuesto = true;
      break;
    }
  }
  if (tieneUsuario && tieneUniqueCompuesto) return;

  db.exec('BEGIN');
  try {
    db.exec(`
      CREATE TABLE contactos_new (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id  INTEGER NOT NULL REFERENCES usuarios(id),
        nombre      TEXT NOT NULL,
        whatsapp    TEXT,
        email       TEXT,
        notas       TEXT,
        creado      DATETIME DEFAULT CURRENT_TIMESTAMP,
        actualizado DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(usuario_id, nombre)
      );
    `);
    // Copiar datos: si existe columna usuario_id la usamos; si no, todo al owner.
    if (tieneUsuario) {
      db.exec(`INSERT INTO contactos_new (id, usuario_id, nombre, whatsapp, email, notas, creado, actualizado)
               SELECT id, COALESCE(usuario_id, ${OWNER_ID}), nombre, whatsapp, email, notas, creado, actualizado FROM contactos`);
    } else {
      db.exec(`INSERT INTO contactos_new (id, usuario_id, nombre, whatsapp, email, notas, creado, actualizado)
               SELECT id, ${OWNER_ID}, nombre, whatsapp, email, notas, creado, actualizado FROM contactos`);
    }
    db.exec('DROP TABLE contactos');
    db.exec('ALTER TABLE contactos_new RENAME TO contactos');
    db.exec(`CREATE INDEX IF NOT EXISTS idx_contactos_whatsapp ON contactos(whatsapp)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_contactos_email    ON contactos(email)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_contactos_usuario  ON contactos(usuario_id, nombre)`);
    db.exec('COMMIT');
    console.log('[memory] migración: contactos recreado con (usuario_id, nombre) UNIQUE');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
_migrarContactos();

// `hechos` lo mismo: clave única era global, pasa a per-user.
function _migrarHechos() {
  if (!_tablaExiste('hechos')) {
    db.exec(`
      CREATE TABLE hechos (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id  INTEGER NOT NULL REFERENCES usuarios(id),
        clave       TEXT NOT NULL,
        valor       TEXT NOT NULL,
        fuente      TEXT,
        creado      DATETIME DEFAULT CURRENT_TIMESTAMP,
        actualizado DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(usuario_id, clave)
      );
    `);
    return;
  }
  const cols = db.prepare(`PRAGMA table_info(hechos)`).all();
  const tieneUsuario = cols.some(c => c.name === 'usuario_id');
  const idx = db.prepare(`PRAGMA index_list(hechos)`).all();
  let tieneUniqueCompuesto = false;
  for (const i of idx) {
    if (!i.unique) continue;
    const cols2 = db.prepare(`PRAGMA index_info(${i.name})`).all().map(c => c.name).sort();
    if (cols2.length === 2 && cols2.includes('usuario_id') && cols2.includes('clave')) {
      tieneUniqueCompuesto = true;
      break;
    }
  }
  if (tieneUsuario && tieneUniqueCompuesto) return;

  db.exec('BEGIN');
  try {
    db.exec(`
      CREATE TABLE hechos_new (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id  INTEGER NOT NULL REFERENCES usuarios(id),
        clave       TEXT NOT NULL,
        valor       TEXT NOT NULL,
        fuente      TEXT,
        creado      DATETIME DEFAULT CURRENT_TIMESTAMP,
        actualizado DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(usuario_id, clave)
      );
    `);
    if (tieneUsuario) {
      db.exec(`INSERT INTO hechos_new (id, usuario_id, clave, valor, fuente, creado, actualizado)
               SELECT id, COALESCE(usuario_id, ${OWNER_ID}), clave, valor, fuente, creado, actualizado FROM hechos`);
    } else {
      db.exec(`INSERT INTO hechos_new (id, usuario_id, clave, valor, fuente, creado, actualizado)
               SELECT id, ${OWNER_ID}, clave, valor, fuente, creado, actualizado FROM hechos`);
    }
    db.exec('DROP TABLE hechos');
    db.exec('ALTER TABLE hechos_new RENAME TO hechos');
    db.exec('COMMIT');
    console.log('[memory] migración: hechos recreado con (usuario_id, clave) UNIQUE');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
_migrarHechos();

// Migrar estado → estado_usuario las keys que son per-user.
// Claves conocidas por usuario: morning_brief_ultimo_dia, ultimo_recordatorio_consultas,
// ultimo_recordatorio_tareas. Y 'diego_wa_lid' pasa a la columna usuarios.wa_lid.
function _migrarEstadoUsuario() {
  // wa_lid → columna del owner
  const lidRow = db.prepare(`SELECT valor_json FROM estado WHERE clave = 'diego_wa_lid'`).get();
  if (lidRow) {
    let lid = null;
    try { lid = JSON.parse(lidRow.valor_json); } catch { lid = lidRow.valor_json; }
    if (lid && typeof lid === 'string') {
      db.prepare(`UPDATE usuarios SET wa_lid = ? WHERE id = ? AND (wa_lid IS NULL OR wa_lid = '')`).run(lid, OWNER_ID);
    }
    db.prepare(`DELETE FROM estado WHERE clave = 'diego_wa_lid'`).run();
    console.log('[memory] migración: diego_wa_lid → usuarios.wa_lid');
  }

  // Mover keys per-user a estado_usuario (y borrarlas de estado).
  const clavesPerUser = [
    'morning_brief_ultimo_dia',
    'ultimo_recordatorio_consultas',
    'ultimo_recordatorio_tareas',
  ];
  for (const clave of clavesPerUser) {
    const row = db.prepare(`SELECT valor_json FROM estado WHERE clave = ?`).get(clave);
    if (!row) continue;
    db.prepare(`
      INSERT OR REPLACE INTO estado_usuario (usuario_id, clave, valor_json, actualizado)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `).run(OWNER_ID, clave, row.valor_json);
    db.prepare(`DELETE FROM estado WHERE clave = ?`).run(clave);
    console.log(`[memory] migración: estado.${clave} → estado_usuario[${OWNER_ID}].${clave}`);
  }
}
_migrarEstadoUsuario();

// ─── Eventos ──────────────────────────────────────────────────────────────

const insertEvento = db.prepare(`
  INSERT INTO eventos (usuario_id, canal, direccion, de, nombre, asunto, cuerpo, tipo_original, metadata_json)
  VALUES (@usuario_id, @canal, @direccion, @de, @nombre, @asunto, @cuerpo, @tipo_original, @metadata_json)
`);

/**
 * Registrar un evento. `usuarioId` es requerido salvo para eventos de 'sistema'
 * sin contexto de usuario (ej. boot/shutdown global).
 */
function log(evt) {
  const row = {
    usuario_id: evt.usuarioId ?? null,
    canal: evt.canal,
    direccion: evt.direccion,
    de: evt.de || null,
    nombre: evt.nombre || null,
    asunto: evt.asunto || null,
    cuerpo: evt.cuerpo || null,
    tipo_original: evt.tipo_original || null,
    metadata_json: evt.metadata ? JSON.stringify(evt.metadata) : null,
  };
  const info = insertEvento.run(row);
  return info.lastInsertRowid;
}

const qRecientesUsuario = db.prepare(`
  SELECT id, timestamp, usuario_id, canal, direccion, de, nombre, asunto, cuerpo, tipo_original, metadata_json
  FROM eventos
  WHERE usuario_id = ? OR (usuario_id IS NULL AND canal = 'sistema')
  ORDER BY timestamp DESC, id DESC
  LIMIT ?
`);
function recientes(usuarioId, { limit = 20 } = {}) {
  return qRecientesUsuario.all(usuarioId, limit).map(hidratar);
}

const qPorCanalUsuario = db.prepare(`
  SELECT id, timestamp, usuario_id, canal, direccion, de, nombre, asunto, cuerpo, tipo_original, metadata_json
  FROM eventos
  WHERE canal = ? AND (usuario_id = ? OR (usuario_id IS NULL AND canal = 'sistema'))
  ORDER BY timestamp DESC, id DESC
  LIMIT ?
`);
function porCanal(usuarioId, canal, { limit = 20 } = {}) {
  return qPorCanalUsuario.all(canal, usuarioId, limit).map(hidratar);
}

const qPorContactoUsuario = db.prepare(`
  SELECT id, timestamp, usuario_id, canal, direccion, de, nombre, asunto, cuerpo, tipo_original, metadata_json
  FROM eventos
  WHERE usuario_id = ? AND (de = ? OR nombre = ?)
  ORDER BY timestamp DESC, id DESC
  LIMIT ?
`);
function porContacto(usuarioId, identificador, { limit = 20 } = {}) {
  return qPorContactoUsuario.all(usuarioId, identificador, identificador, limit).map(hidratar);
}

const qDesdeHorasUsuario = db.prepare(`
  SELECT id, timestamp, usuario_id, canal, direccion, de, nombre, asunto, cuerpo, tipo_original, metadata_json
  FROM eventos
  WHERE (usuario_id = ? OR (usuario_id IS NULL AND canal = 'sistema'))
    AND timestamp >= datetime('now', ?)
  ORDER BY timestamp ASC, id ASC
`);
function desdeHoras(usuarioId, horas) {
  return qDesdeHorasUsuario.all(usuarioId, `-${Number(horas)} hours`).map(hidratar);
}

function contextoCrossCanal(usuarioId, { desdeHoras: horas = 24, max = 50 } = {}) {
  const evs = desdeHoras(usuarioId, horas).slice(-max);
  if (!evs.length) return '(sin actividad reciente)';
  return evs.map(formatearParaPrompt).join('\n');
}

function formatearParaPrompt(e) {
  const ts = e.timestamp;
  const flecha = e.direccion === 'entrante' ? '→' : (e.direccion === 'saliente' ? '←' : '·');
  const quien = e.nombre || e.de || '?';
  const cuerpo = (e.cuerpo || '').replace(/\s+/g, ' ').slice(0, 300);
  if (e.canal === 'gmail')    return `[${ts}] ${flecha} GMAIL ${quien} | "${e.asunto || ''}" | ${cuerpo}`;
  if (e.canal === 'calendar') return `[${ts}] ${flecha} CAL ${quien} | ${cuerpo}`;
  if (e.canal === 'sistema')  return `[${ts}] · SIS ${cuerpo}`;
  return `[${ts}] ${flecha} WA ${quien}: ${cuerpo}`;
}

function hidratar(row) {
  if (!row) return row;
  if (row.metadata_json) {
    try { row.metadata = JSON.parse(row.metadata_json); } catch { row.metadata = null; }
  }
  return row;
}

// ─── Estado GLOBAL (kv compartido de Maria) ──────────────────────────────
// Solo para flags a nivel proceso: ej. 'gmail:procesados' (inbox único).

const upsertEstado = db.prepare(`
  INSERT INTO estado (clave, valor_json, actualizado)
  VALUES (?, ?, CURRENT_TIMESTAMP)
  ON CONFLICT(clave) DO UPDATE SET valor_json = excluded.valor_json, actualizado = CURRENT_TIMESTAMP
`);
const qEstado = db.prepare(`SELECT valor_json FROM estado WHERE clave = ?`);
const delEstado = db.prepare(`DELETE FROM estado WHERE clave = ?`);

function setEstado(clave, valor) { upsertEstado.run(clave, JSON.stringify(valor)); }
function getEstado(clave) {
  const row = qEstado.get(clave);
  if (!row) return null;
  try { return JSON.parse(row.valor_json); } catch { return null; }
}
function borrarEstado(clave) { delEstado.run(clave); }

// ─── Estado POR USUARIO ──────────────────────────────────────────────────

const upsertEstadoUsuario = db.prepare(`
  INSERT INTO estado_usuario (usuario_id, clave, valor_json, actualizado)
  VALUES (?, ?, ?, CURRENT_TIMESTAMP)
  ON CONFLICT(usuario_id, clave) DO UPDATE SET valor_json = excluded.valor_json, actualizado = CURRENT_TIMESTAMP
`);
const qEstadoUsuario = db.prepare(`SELECT valor_json FROM estado_usuario WHERE usuario_id = ? AND clave = ?`);
const delEstadoUsuario = db.prepare(`DELETE FROM estado_usuario WHERE usuario_id = ? AND clave = ?`);

function setEstadoUsuario(usuarioId, clave, valor) {
  upsertEstadoUsuario.run(usuarioId, clave, JSON.stringify(valor));
}
function getEstadoUsuario(usuarioId, clave) {
  const row = qEstadoUsuario.get(usuarioId, clave);
  if (!row) return null;
  try { return JSON.parse(row.valor_json); } catch { return null; }
}
function borrarEstadoUsuario(usuarioId, clave) { delEstadoUsuario.run(usuarioId, clave); }

// ─── Pendientes ──────────────────────────────────────────────────────────

const CAMPOS_META_CONOCIDOS = new Set([
  'remitente', 'canal_origen', 'de', 'email', 'messageId', 'ultimo_recordatorio',
]);

function _descomponerMeta(meta = {}) {
  const conocidos = {
    remitente:        meta.remitente || null,
    canal_origen:     meta.canal_origen || null,
    destino_wa:       meta.de || null,
    destino_email:    meta.email || null,
    email_message_id: meta.messageId || null,
  };
  const resto = {};
  for (const [k, v] of Object.entries(meta)) {
    if (!CAMPOS_META_CONOCIDOS.has(k)) resto[k] = v;
  }
  return { conocidos, resto };
}

function _rehidratarPendiente(row) {
  if (!row) return null;
  const meta = {};
  if (row.remitente)        meta.remitente    = row.remitente;
  if (row.canal_origen)     meta.canal_origen = row.canal_origen;
  if (row.destino_wa)       meta.de           = row.destino_wa;
  if (row.destino_email)    meta.email        = row.destino_email;
  if (row.email_message_id) meta.messageId    = row.email_message_id;
  if (row.ultimo_recordatorio) meta.ultimo_recordatorio = row.ultimo_recordatorio;
  if (row.meta_json) {
    try { Object.assign(meta, JSON.parse(row.meta_json)); } catch {}
  }
  return {
    id: row.id,
    usuario_id: row.usuario_id,
    desc: row.desc,
    creado: row.creado,
    estado: row.estado,
    cerrado: row.cerrado,
    ultimo_recordatorio: row.ultimo_recordatorio,
    meta,
  };
}

const insertPendiente = db.prepare(`
  INSERT INTO pendientes (usuario_id, desc, remitente, canal_origen, destino_wa, destino_email, email_message_id, meta_json)
  VALUES (@usuario_id, @desc, @remitente, @canal_origen, @destino_wa, @destino_email, @email_message_id, @meta_json)
`);
const qPendientesAbiertosUsuario = db.prepare(`
  SELECT * FROM pendientes WHERE usuario_id = ? AND estado = 'abierto' ORDER BY creado ASC, id ASC
`);
const qPendientePorId = db.prepare(`SELECT * FROM pendientes WHERE id = ?`);
const qPendientePorDescUsuario = db.prepare(`
  SELECT * FROM pendientes WHERE usuario_id = ? AND estado = 'abierto' AND desc = ? ORDER BY creado ASC LIMIT 1
`);
const cerrarPendienteStmt = db.prepare(`
  UPDATE pendientes SET estado = 'cerrado', cerrado = CURRENT_TIMESTAMP WHERE id = ?
`);
const marcarRecordatorioStmt = db.prepare(`
  UPDATE pendientes SET ultimo_recordatorio = ? WHERE id = ?
`);

function agregarPendiente(usuarioId, desc, meta = {}) {
  if (!usuarioId) throw new Error('agregarPendiente: usuarioId requerido');
  if (!desc) throw new Error('agregarPendiente: desc requerido');
  const { conocidos, resto } = _descomponerMeta(meta);
  const info = insertPendiente.run({
    usuario_id: usuarioId,
    desc,
    ...conocidos,
    meta_json: Object.keys(resto).length ? JSON.stringify(resto) : null,
  });
  return info.lastInsertRowid;
}

function listarPendientes(usuarioId) {
  if (!usuarioId) throw new Error('listarPendientes: usuarioId requerido');
  return qPendientesAbiertosUsuario.all(usuarioId).map(_rehidratarPendiente);
}

function obtenerPendiente(id) {
  return _rehidratarPendiente(qPendientePorId.get(id));
}

/**
 * Cierra un pendiente perteneciente a `usuarioId`. Acepta id numérico, desc
 * literal u objeto. Si el pendiente no es del usuario, devuelve null (evita
 * que un usuario cierre el pendiente de otro).
 */
function quitarPendiente(usuarioId, arg) {
  if (!usuarioId) throw new Error('quitarPendiente: usuarioId requerido');
  let id = null;

  if (typeof arg === 'number') {
    id = arg;
  } else if (typeof arg === 'string') {
    const row = qPendientePorDescUsuario.get(usuarioId, arg);
    if (row) id = row.id;
  } else if (arg && typeof arg === 'object') {
    if (typeof arg.id === 'number') {
      id = arg.id;
    } else if (typeof arg.desc === 'string') {
      const row = qPendientePorDescUsuario.get(usuarioId, arg.desc);
      if (row) id = row.id;
    } else if (typeof arg.indice === 'number') {
      const abiertos = qPendientesAbiertosUsuario.all(usuarioId);
      const idx = arg.indice - 1;
      if (idx >= 0 && idx < abiertos.length) id = abiertos[idx].id;
    }
  }

  if (id == null) return null;
  const antes = qPendientePorId.get(id);
  if (!antes || antes.estado !== 'abierto') return null;
  if (antes.usuario_id !== usuarioId) return null; // aislamiento
  cerrarPendienteStmt.run(id);
  return _rehidratarPendiente(qPendientePorId.get(id));
}

function marcarRecordatorioPendiente(id, ts = new Date().toISOString()) {
  marcarRecordatorioStmt.run(ts, id);
}

// Migración legacy: blob JSON en estado.pendientes → tabla. Muy antigua, queda
// como red de seguridad por si algún DB intermedio aún tiene rastros.
function _migrarPendientesBlob() {
  const viejos = getEstado('pendientes');
  if (!Array.isArray(viejos) || !viejos.length) return 0;
  let n = 0;
  const tx = db.transaction((lista) => {
    for (const p of lista) {
      if (!p || !p.desc) continue;
      agregarPendiente(OWNER_ID, p.desc, p.meta || {});
      n++;
    }
  });
  tx(viejos);
  borrarEstado('pendientes');
  return n;
}
try {
  const n = _migrarPendientesBlob();
  if (n) console.log(`[memory] migrados ${n} pendiente(s) del blob JSON (legacy)`);
} catch (err) {
  console.warn('[memory] migración legacy de pendientes falló:', err.message);
}

// ─── Contactos ────────────────────────────────────────────────────────────

const insertContacto = db.prepare(`
  INSERT INTO contactos (usuario_id, nombre, whatsapp, email, notas)
  VALUES (@usuario_id, @nombre, @whatsapp, @email, @notas)
  ON CONFLICT(usuario_id, nombre) DO UPDATE SET
    whatsapp = COALESCE(excluded.whatsapp, contactos.whatsapp),
    email    = COALESCE(excluded.email,    contactos.email),
    notas    = COALESCE(excluded.notas,    contactos.notas),
    actualizado = CURRENT_TIMESTAMP
`);
const qContactoPorNombre   = db.prepare(`SELECT * FROM contactos WHERE usuario_id = ? AND nombre = ? COLLATE NOCASE`);
const qContactoPorWhatsapp = db.prepare(`SELECT * FROM contactos WHERE usuario_id = ? AND whatsapp = ?`);
const qContactoPorEmail    = db.prepare(`SELECT * FROM contactos WHERE usuario_id = ? AND email = ? COLLATE NOCASE`);
const qContactosTodos      = db.prepare(`SELECT * FROM contactos WHERE usuario_id = ? ORDER BY nombre COLLATE NOCASE`);

function upsertContacto({ usuarioId, nombre, whatsapp = null, email = null, notas = null }) {
  if (!usuarioId) throw new Error('upsertContacto: usuarioId requerido');
  if (!nombre) throw new Error('upsertContacto: nombre requerido');
  insertContacto.run({ usuario_id: usuarioId, nombre, whatsapp, email, notas });
  return qContactoPorNombre.get(usuarioId, nombre);
}

function buscarContacto({ usuarioId, nombre, whatsapp, email } = {}) {
  if (!usuarioId) throw new Error('buscarContacto: usuarioId requerido');
  if (nombre)   return qContactoPorNombre.get(usuarioId, nombre)   || null;
  if (whatsapp) return qContactoPorWhatsapp.get(usuarioId, whatsapp) || null;
  if (email)    return qContactoPorEmail.get(usuarioId, email)    || null;
  return null;
}

function todosLosContactos(usuarioId) {
  if (!usuarioId) throw new Error('todosLosContactos: usuarioId requerido');
  return qContactosTodos.all(usuarioId);
}

// Lookup cross-usuario: dado un whatsapp / email / nombre, devuelve TODOS los
// contactos (de cualquier usuario) que matcheen. Pensado para el unknown-flow
// y para la herramienta owner-only `buscar_contacto_global`.
//
// - whatsapp: match exacto (case-sensitive porque JIDs son literales).
// - email: match case-insensitive.
// - nombre: match case-insensitive (COLLATE NOCASE), parcial con LIKE.
//
// Devuelve array (posiblemente vacío). Si hay que resolver unicidad, lo hace
// el caller.
const qContactoXUWhatsapp = db.prepare(`SELECT * FROM contactos WHERE whatsapp = ?`);
const qContactoXUEmail    = db.prepare(`SELECT * FROM contactos WHERE email = ? COLLATE NOCASE`);
const qContactoXUNombre   = db.prepare(`SELECT * FROM contactos WHERE nombre LIKE ? COLLATE NOCASE ORDER BY nombre`);
const qContactoXUTodos    = db.prepare(`SELECT * FROM contactos WHERE whatsapp IS NOT NULL`);

// Deja solo dígitos. Útil para comparar JIDs ("5491123456789@c.us") contra
// números guardados en formato humano ("+54 9 11 2345-6789").
function _soloDigitos(s) { return String(s || '').replace(/\D+/g, ''); }

// Match "flexible" por dígitos: dos números matchean si uno termina con el
// otro con al menos 8 dígitos en común (cubre casos con/sin país, con/sin 9
// de celular Argentina, con/sin 15 argentino legacy).
function _matchNumeroFlex(a, b) {
  const da = _soloDigitos(a);
  const db_ = _soloDigitos(b);
  if (!da || !db_ || da.length < 8 || db_.length < 8) return false;
  return da.endsWith(db_) || db_.endsWith(da);
}

function buscarContactoCrossUsuario({ whatsapp = null, email = null, nombre = null } = {}) {
  const resultados = [];
  const vistos = new Set();
  const push = (row) => {
    if (!row || vistos.has(row.id)) return;
    vistos.add(row.id);
    resultados.push(row);
  };
  if (whatsapp) {
    // 1) match exacto (usa índice idx_contactos_whatsapp).
    for (const r of qContactoXUWhatsapp.all(whatsapp)) push(r);
    // 2) si no hubo exact, scan con comparación flexible por dígitos.
    if (resultados.length === 0) {
      for (const r of qContactoXUTodos.all()) {
        if (_matchNumeroFlex(r.whatsapp, whatsapp)) push(r);
      }
    }
  }
  if (email) {
    for (const r of qContactoXUEmail.all(email)) push(r);
  }
  if (nombre) {
    for (const r of qContactoXUNombre.all(`%${nombre}%`)) push(r);
  }
  return resultados;
}

// ─── Programados ─────────────────────────────────────────────────────────

const insertProgramado = db.prepare(`
  INSERT INTO programados (usuario_id, cuando, canal, destino, asunto, texto, razon, metadata_json)
  VALUES (@usuario_id, @cuando, @canal, @destino, @asunto, @texto, @razon, @metadata_json)
`);
const qProgramadosDebidos = db.prepare(`
  SELECT * FROM programados WHERE enviado = 0 AND cuando <= ? ORDER BY cuando ASC
`);
const qProgramadosProximosUsuario = db.prepare(`
  SELECT * FROM programados WHERE usuario_id = ? AND enviado = 0 ORDER BY cuando ASC LIMIT ?
`);
const qProgramadoPorRazonDesde = db.prepare(`
  SELECT * FROM programados WHERE razon = ? AND cuando >= ? ORDER BY cuando ASC LIMIT 1
`);
const updProgramadoEnviado   = db.prepare(`UPDATE programados SET enviado = 1 WHERE id = ?`);
const updProgramadoCancelado = db.prepare(`UPDATE programados SET enviado = -1 WHERE id = ?`);

function programarMensaje({ usuarioId, cuando, canal, destino, asunto = null, texto, razon = null, metadata = null }) {
  if (!usuarioId) throw new Error('programarMensaje: usuarioId requerido');
  if (!cuando || !canal || !destino || !texto) {
    throw new Error('programarMensaje: faltan cuando/canal/destino/texto');
  }
  const cuandoIso = cuando instanceof Date ? cuando.toISOString() : new Date(cuando).toISOString();
  const info = insertProgramado.run({
    usuario_id: usuarioId,
    cuando: cuandoIso, canal, destino,
    asunto: asunto || null,
    texto,
    razon: razon || null,
    metadata_json: metadata ? JSON.stringify(metadata) : null,
  });
  return info.lastInsertRowid;
}
function programadosDebidos(hasta = new Date()) {
  const iso = hasta instanceof Date ? hasta.toISOString() : new Date(hasta).toISOString();
  return qProgramadosDebidos.all(iso).map(hidratar);
}
function proximosProgramados(usuarioId, { max = 10 } = {}) {
  if (!usuarioId) throw new Error('proximosProgramados: usuarioId requerido');
  return qProgramadosProximosUsuario.all(usuarioId, max).map(hidratar);
}
function existeProgramadoFuturo(razon, desde = new Date()) {
  const iso = desde instanceof Date ? desde.toISOString() : new Date(desde).toISOString();
  return !!qProgramadoPorRazonDesde.get(razon, iso);
}
function marcarProgramadoEnviado(id) { updProgramadoEnviado.run(id); }
function cancelarProgramado(id)      { updProgramadoCancelado.run(id); }

// ─── Hechos ──────────────────────────────────────────────────────────────

const upsertHecho = db.prepare(`
  INSERT INTO hechos (usuario_id, clave, valor, fuente)
  VALUES (@usuario_id, @clave, @valor, @fuente)
  ON CONFLICT(usuario_id, clave) DO UPDATE SET
    valor = excluded.valor,
    fuente = COALESCE(excluded.fuente, hechos.fuente),
    actualizado = CURRENT_TIMESTAMP
`);
const qHechosUsuario = db.prepare(`SELECT clave, valor, fuente, actualizado FROM hechos WHERE usuario_id = ? ORDER BY clave`);
const delHecho       = db.prepare(`DELETE FROM hechos WHERE usuario_id = ? AND clave = ?`);

function recordarHecho({ usuarioId, clave, valor, fuente = null }) {
  if (!usuarioId) throw new Error('recordarHecho: usuarioId requerido');
  if (!clave || !valor) throw new Error('recordarHecho: clave y valor requeridos');
  upsertHecho.run({ usuario_id: usuarioId, clave, valor, fuente });
  return { clave, valor };
}
function olvidarHecho(usuarioId, clave) {
  if (!usuarioId) throw new Error('olvidarHecho: usuarioId requerido');
  delHecho.run(usuarioId, clave);
  return { clave, olvidado: true };
}
function listarHechos(usuarioId) {
  if (!usuarioId) throw new Error('listarHechos: usuarioId requerido');
  return qHechosUsuario.all(usuarioId);
}

// ─── Import contactos.json (legacy, para el owner) ───────────────────────

function importarDesdeContactosJson(usuarioId, rutaJson) {
  if (!usuarioId) throw new Error('importarDesdeContactosJson: usuarioId requerido');
  if (!fs.existsSync(rutaJson)) return 0;
  const raw = fs.readFileSync(rutaJson, 'utf8').trim();
  if (!raw) return 0;
  let obj;
  try { obj = JSON.parse(raw); } catch { return 0; }
  let n = 0;
  for (const [nombre, data] of Object.entries(obj)) {
    if (!nombre) continue;
    const d = typeof data === 'string' ? { whatsapp: data } : (data || {});
    upsertContacto({
      usuarioId,
      nombre,
      whatsapp: d.whatsapp || d.wa || null,
      email:    d.email    || null,
      notas:    d.notas    || null,
    });
    n++;
  }
  return n;
}

// ─── Exports ──────────────────────────────────────────────────────────────

module.exports = {
  db,
  OWNER_ID,           // id del owner bootstrapeado (usado en fallbacks)
  // eventos
  log,
  recientes,
  porCanal,
  porContacto,
  desdeHoras,
  contextoCrossCanal,
  // estado global
  setEstado,
  getEstado,
  borrarEstado,
  // estado por usuario
  setEstadoUsuario,
  getEstadoUsuario,
  borrarEstadoUsuario,
  // pendientes
  agregarPendiente,
  listarPendientes,
  obtenerPendiente,
  quitarPendiente,
  marcarRecordatorioPendiente,
  // contactos
  upsertContacto,
  buscarContacto,
  buscarContactoCrossUsuario,
  todosLosContactos,
  importarDesdeContactosJson,
  // programados
  programarMensaje,
  programadosDebidos,
  proximosProgramados,
  existeProgramadoFuturo,
  marcarProgramadoEnviado,
  cancelarProgramado,
  // hechos
  recordarHecho,
  olvidarHecho,
  listarHechos,
};
