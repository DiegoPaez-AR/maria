// memory.js — capa de persistencia SQLite para Maria
// Memoria cross-canal (WhatsApp + Gmail + Calendar + eventos internos)
//
// Tablas:
//   - eventos    → todo lo que pasa (mensajes, emails, acciones), cronológico
//   - estado     → pares clave/valor para cosas pendientes, contadores, flags
//   - contactos  → libreta propia de Maria (nombre → whatsapp + email + notas)
//
// Uso:
//   const mem = require('./memory');
//   mem.log({ canal: 'whatsapp', direccion: 'entrante', de: '541132317896@c.us', cuerpo: 'hola' });
//   const recientes = mem.recientes({ limit: 20 });
//   const contexto  = mem.contextoCrossCanal({ desdeHoras: 24 });

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_DIR  = path.join(__dirname, 'db');
const DB_PATH = process.env.MARIA_DB || path.join(DB_DIR, 'maria.sqlite');

if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─── Schema ───────────────────────────────────────────────────────────────

db.exec(`
CREATE TABLE IF NOT EXISTS eventos (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp      DATETIME DEFAULT CURRENT_TIMESTAMP,
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

CREATE TABLE IF NOT EXISTS estado (
  clave       TEXT PRIMARY KEY,
  valor_json  TEXT NOT NULL,
  actualizado DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS contactos (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre    TEXT UNIQUE NOT NULL,
  whatsapp  TEXT,
  email     TEXT,
  notas     TEXT,
  creado    DATETIME DEFAULT CURRENT_TIMESTAMP,
  actualizado DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_contactos_whatsapp ON contactos(whatsapp);
CREATE INDEX IF NOT EXISTS idx_contactos_email    ON contactos(email);

CREATE TABLE IF NOT EXISTS programados (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  creado        DATETIME DEFAULT CURRENT_TIMESTAMP,
  cuando        TEXT NOT NULL,                  -- ISO UTC
  canal         TEXT NOT NULL CHECK(canal IN ('whatsapp','gmail')),
  destino       TEXT NOT NULL,
  asunto        TEXT,
  texto         TEXT NOT NULL,
  enviado       INTEGER NOT NULL DEFAULT 0,     -- 0=pendiente, 1=enviado, -1=cancelado
  razon         TEXT,                            -- p.ej. 'morning_brief', 'meeting_prep', 'usuario'
  metadata_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_prog_cuando ON programados(cuando, enviado);
CREATE INDEX IF NOT EXISTS idx_prog_razon  ON programados(razon, enviado);

CREATE TABLE IF NOT EXISTS hechos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  clave       TEXT UNIQUE NOT NULL,
  valor       TEXT NOT NULL,
  fuente      TEXT,
  creado      DATETIME DEFAULT CURRENT_TIMESTAMP,
  actualizado DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pendientes (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  creado              DATETIME DEFAULT CURRENT_TIMESTAMP,
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
CREATE INDEX IF NOT EXISTS idx_pendientes_estado ON pendientes(estado, creado);
CREATE INDEX IF NOT EXISTS idx_pendientes_remit  ON pendientes(remitente, estado);
`);

// ─── Eventos ──────────────────────────────────────────────────────────────

const insertEvento = db.prepare(`
  INSERT INTO eventos (canal, direccion, de, nombre, asunto, cuerpo, tipo_original, metadata_json)
  VALUES (@canal, @direccion, @de, @nombre, @asunto, @cuerpo, @tipo_original, @metadata_json)
`);

/**
 * Registrar un evento. Pasar al menos {canal, direccion}.
 * Ej: log({ canal:'whatsapp', direccion:'entrante', de:'541132317896@c.us', cuerpo:'hola' })
 */
function log(evt) {
  const row = {
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

const qRecientes = db.prepare(`
  SELECT id, timestamp, canal, direccion, de, nombre, asunto, cuerpo, tipo_original, metadata_json
  FROM eventos
  ORDER BY timestamp DESC, id DESC
  LIMIT ?
`);

function recientes({ limit = 20 } = {}) {
  return qRecientes.all(limit).map(hidratar);
}

const qPorCanal = db.prepare(`
  SELECT id, timestamp, canal, direccion, de, nombre, asunto, cuerpo, tipo_original, metadata_json
  FROM eventos
  WHERE canal = ?
  ORDER BY timestamp DESC, id DESC
  LIMIT ?
`);

function porCanal(canal, { limit = 20 } = {}) {
  return qPorCanal.all(canal, limit).map(hidratar);
}

const qPorContacto = db.prepare(`
  SELECT id, timestamp, canal, direccion, de, nombre, asunto, cuerpo, tipo_original, metadata_json
  FROM eventos
  WHERE de = ? OR nombre = ?
  ORDER BY timestamp DESC, id DESC
  LIMIT ?
`);

function porContacto(identificador, { limit = 20 } = {}) {
  return qPorContacto.all(identificador, identificador, limit).map(hidratar);
}

const qDesdeHoras = db.prepare(`
  SELECT id, timestamp, canal, direccion, de, nombre, asunto, cuerpo, tipo_original, metadata_json
  FROM eventos
  WHERE timestamp >= datetime('now', ?)
  ORDER BY timestamp ASC, id ASC
`);

/**
 * Devuelve todos los eventos desde hace N horas (útil para prompt cross-canal).
 */
function desdeHoras(horas) {
  return qDesdeHoras.all(`-${Number(horas)} hours`).map(hidratar);
}

/**
 * Arma un bloque de texto cross-canal listo para inyectar en el prompt de Claude.
 * Agrupa WA + Gmail + Calendar en orden cronológico.
 */
function contextoCrossCanal({ desdeHoras: horas = 24, max = 50 } = {}) {
  const evs = desdeHoras(horas).slice(-max);
  if (!evs.length) return '(sin actividad reciente)';
  return evs.map(formatearParaPrompt).join('\n');
}

function formatearParaPrompt(e) {
  const ts = e.timestamp;
  const flecha = e.direccion === 'entrante' ? '→' : (e.direccion === 'saliente' ? '←' : '·');
  const quien = e.nombre || e.de || '?';
  const cuerpo = (e.cuerpo || '').replace(/\s+/g, ' ').slice(0, 300);
  if (e.canal === 'gmail') {
    return `[${ts}] ${flecha} GMAIL ${quien} | "${e.asunto || ''}" | ${cuerpo}`;
  }
  if (e.canal === 'calendar') {
    return `[${ts}] ${flecha} CAL ${quien} | ${cuerpo}`;
  }
  if (e.canal === 'sistema') {
    return `[${ts}] · SIS ${cuerpo}`;
  }
  return `[${ts}] ${flecha} WA ${quien}: ${cuerpo}`;
}

function hidratar(row) {
  if (!row) return row;
  if (row.metadata_json) {
    try { row.metadata = JSON.parse(row.metadata_json); } catch { row.metadata = null; }
  }
  return row;
}

// ─── Estado (pendientes, flags, contadores) ──────────────────────────────

const upsertEstado = db.prepare(`
  INSERT INTO estado (clave, valor_json, actualizado)
  VALUES (?, ?, CURRENT_TIMESTAMP)
  ON CONFLICT(clave) DO UPDATE SET
    valor_json = excluded.valor_json,
    actualizado = CURRENT_TIMESTAMP
`);
const qEstado = db.prepare(`SELECT valor_json FROM estado WHERE clave = ?`);
const delEstado = db.prepare(`DELETE FROM estado WHERE clave = ?`);
const qTodoEstado = db.prepare(`SELECT clave, valor_json, actualizado FROM estado`);

function setEstado(clave, valor) {
  upsertEstado.run(clave, JSON.stringify(valor));
}

function getEstado(clave) {
  const row = qEstado.get(clave);
  if (!row) return null;
  try { return JSON.parse(row.valor_json); } catch { return null; }
}

function borrarEstado(clave) {
  delEstado.run(clave);
}

function todoEstado() {
  const out = {};
  for (const r of qTodoEstado.all()) {
    try { out[r.clave] = JSON.parse(r.valor_json); } catch { out[r.clave] = r.valor_json; }
  }
  return out;
}

// ─── Pendientes (tabla dedicada, antes era un blob JSON en estado) ───────
//
// Un "pendiente" es algo que Maria dejó en el aire y tiene que retomar.
// Campos "conocidos" van en columnas propias para consultas SQL; el resto
// del meta queda en meta_json. Soft-delete: quitar NO borra — marca
// estado='cerrado', así queda auditable.

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
    try {
      const extra = JSON.parse(row.meta_json);
      Object.assign(meta, extra);
    } catch {}
  }
  return {
    id: row.id,
    desc: row.desc,
    creado: row.creado,
    estado: row.estado,
    cerrado: row.cerrado,
    ultimo_recordatorio: row.ultimo_recordatorio,
    meta,
  };
}

const insertPendiente = db.prepare(`
  INSERT INTO pendientes (desc, remitente, canal_origen, destino_wa, destino_email, email_message_id, meta_json)
  VALUES (@desc, @remitente, @canal_origen, @destino_wa, @destino_email, @email_message_id, @meta_json)
`);
const qPendientesAbiertos = db.prepare(`
  SELECT * FROM pendientes WHERE estado = 'abierto' ORDER BY creado ASC, id ASC
`);
const qPendientePorId = db.prepare(`SELECT * FROM pendientes WHERE id = ?`);
const qPendientePorDesc = db.prepare(`
  SELECT * FROM pendientes WHERE estado = 'abierto' AND desc = ? ORDER BY creado ASC LIMIT 1
`);
const cerrarPendienteStmt = db.prepare(`
  UPDATE pendientes SET estado = 'cerrado', cerrado = CURRENT_TIMESTAMP WHERE id = ?
`);
const marcarRecordatorioStmt = db.prepare(`
  UPDATE pendientes SET ultimo_recordatorio = ? WHERE id = ?
`);

function agregarPendiente(desc, meta = {}) {
  if (!desc) throw new Error('agregarPendiente: desc requerido');
  const { conocidos, resto } = _descomponerMeta(meta);
  const info = insertPendiente.run({
    desc,
    ...conocidos,
    meta_json: Object.keys(resto).length ? JSON.stringify(resto) : null,
  });
  return info.lastInsertRowid;
}

function listarPendientes() {
  return qPendientesAbiertos.all().map(_rehidratarPendiente);
}

function obtenerPendiente(id) {
  return _rehidratarPendiente(qPendientePorId.get(id));
}

/**
 * Cierra un pendiente. Acepta:
 *   - número → id
 *   - string → desc literal (cierra el más viejo abierto con ese desc)
 *   - objeto {id|desc|indice} → compatibilidad con la API vieja (indice 1-based)
 * Devuelve el row cerrado o null si no encontró nada.
 */
function quitarPendiente(arg) {
  let id = null;

  if (typeof arg === 'number') {
    id = arg;
  } else if (typeof arg === 'string') {
    const row = qPendientePorDesc.get(arg);
    if (row) id = row.id;
  } else if (arg && typeof arg === 'object') {
    if (typeof arg.id === 'number') {
      id = arg.id;
    } else if (typeof arg.desc === 'string') {
      const row = qPendientePorDesc.get(arg.desc);
      if (row) id = row.id;
    } else if (typeof arg.indice === 'number') {
      const abiertos = qPendientesAbiertos.all();
      const idx = arg.indice - 1;
      if (idx >= 0 && idx < abiertos.length) id = abiertos[idx].id;
    }
  }

  if (id == null) return null;
  const antes = qPendientePorId.get(id);
  if (!antes || antes.estado !== 'abierto') return null;
  cerrarPendienteStmt.run(id);
  return _rehidratarPendiente(qPendientePorId.get(id));
}

function marcarRecordatorioPendiente(id, ts = new Date().toISOString()) {
  marcarRecordatorioStmt.run(ts, id);
}

// Migración oportunista: si existe el blob viejo en `estado.pendientes`, lo
// movemos a la tabla y borramos la key. Corre una vez (idempotente: si el
// blob ya no está, no hace nada).
function _migrarPendientesViejos() {
  const viejos = getEstado('pendientes');
  if (!Array.isArray(viejos) || !viejos.length) return 0;
  let n = 0;
  const tx = db.transaction((lista) => {
    for (const p of lista) {
      if (!p || !p.desc) continue;
      agregarPendiente(p.desc, p.meta || {});
      n++;
    }
  });
  tx(viejos);
  borrarEstado('pendientes');
  return n;
}
try {
  const n = _migrarPendientesViejos();
  if (n) console.log(`[memory] migrados ${n} pendiente(s) del blob JSON a la tabla`);
} catch (err) {
  console.warn('[memory] migración de pendientes falló:', err.message);
}

// ─── Contactos ────────────────────────────────────────────────────────────

const insertContacto = db.prepare(`
  INSERT INTO contactos (nombre, whatsapp, email, notas)
  VALUES (@nombre, @whatsapp, @email, @notas)
  ON CONFLICT(nombre) DO UPDATE SET
    whatsapp = COALESCE(excluded.whatsapp, contactos.whatsapp),
    email    = COALESCE(excluded.email,    contactos.email),
    notas    = COALESCE(excluded.notas,    contactos.notas),
    actualizado = CURRENT_TIMESTAMP
`);
const qContactoPorNombre   = db.prepare(`SELECT * FROM contactos WHERE nombre = ? COLLATE NOCASE`);
const qContactoPorWhatsapp = db.prepare(`SELECT * FROM contactos WHERE whatsapp = ?`);
const qContactoPorEmail    = db.prepare(`SELECT * FROM contactos WHERE email = ? COLLATE NOCASE`);
const qContactosTodos      = db.prepare(`SELECT * FROM contactos ORDER BY nombre COLLATE NOCASE`);

function upsertContacto({ nombre, whatsapp = null, email = null, notas = null }) {
  if (!nombre) throw new Error('upsertContacto: nombre requerido');
  insertContacto.run({ nombre, whatsapp, email, notas });
  return qContactoPorNombre.get(nombre);
}

function buscarContacto({ nombre, whatsapp, email } = {}) {
  if (nombre)   return qContactoPorNombre.get(nombre)   || null;
  if (whatsapp) return qContactoPorWhatsapp.get(whatsapp) || null;
  if (email)    return qContactoPorEmail.get(email)    || null;
  return null;
}

function todosLosContactos() {
  return qContactosTodos.all();
}

// ─── Programados (mensajes diferidos) ────────────────────────────────────

const insertProgramado = db.prepare(`
  INSERT INTO programados (cuando, canal, destino, asunto, texto, razon, metadata_json)
  VALUES (@cuando, @canal, @destino, @asunto, @texto, @razon, @metadata_json)
`);
const qProgramadosDebidos = db.prepare(`
  SELECT * FROM programados WHERE enviado = 0 AND cuando <= ? ORDER BY cuando ASC
`);
const qProgramadosProximos = db.prepare(`
  SELECT * FROM programados WHERE enviado = 0 ORDER BY cuando ASC LIMIT ?
`);
const qProgramadoPorRazonDesde = db.prepare(`
  SELECT * FROM programados WHERE razon = ? AND cuando >= ? ORDER BY cuando ASC LIMIT 1
`);
const updProgramadoEnviado  = db.prepare(`UPDATE programados SET enviado = 1 WHERE id = ?`);
const updProgramadoCancelado = db.prepare(`UPDATE programados SET enviado = -1 WHERE id = ?`);

function programarMensaje({ cuando, canal, destino, asunto = null, texto, razon = null, metadata = null }) {
  if (!cuando || !canal || !destino || !texto) {
    throw new Error('programarMensaje: faltan cuando/canal/destino/texto');
  }
  const cuandoIso = cuando instanceof Date ? cuando.toISOString() : new Date(cuando).toISOString();
  const info = insertProgramado.run({
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
function proximosProgramados({ max = 10 } = {}) {
  return qProgramadosProximos.all(max).map(hidratar);
}
function existeProgramadoFuturo(razon, desde = new Date()) {
  const iso = desde instanceof Date ? desde.toISOString() : new Date(desde).toISOString();
  return !!qProgramadoPorRazonDesde.get(razon, iso);
}
function marcarProgramadoEnviado(id) { updProgramadoEnviado.run(id); }
function cancelarProgramado(id)      { updProgramadoCancelado.run(id); }

// ─── Hechos (preferencias persistentes sobre Diego) ──────────────────────

const upsertHecho = db.prepare(`
  INSERT INTO hechos (clave, valor, fuente)
  VALUES (@clave, @valor, @fuente)
  ON CONFLICT(clave) DO UPDATE SET
    valor = excluded.valor,
    fuente = COALESCE(excluded.fuente, hechos.fuente),
    actualizado = CURRENT_TIMESTAMP
`);
const qHechos     = db.prepare(`SELECT clave, valor, fuente, actualizado FROM hechos ORDER BY clave`);
const delHecho    = db.prepare(`DELETE FROM hechos WHERE clave = ?`);

function recordarHecho({ clave, valor, fuente = null }) {
  if (!clave || !valor) throw new Error('recordarHecho: clave y valor requeridos');
  upsertHecho.run({ clave, valor, fuente });
  return { clave, valor };
}
function olvidarHecho(clave) {
  delHecho.run(clave);
  return { clave, olvidado: true };
}
function listarHechos() { return qHechos.all(); }

// ─── Migración desde contactos.json (opcional) ───────────────────────────

function importarDesdeContactosJson(rutaJson) {
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
  db,                       // para queries ad-hoc
  log,
  recientes,
  porCanal,
  porContacto,
  desdeHoras,
  contextoCrossCanal,
  setEstado,
  getEstado,
  borrarEstado,
  todoEstado,
  agregarPendiente,
  listarPendientes,
  obtenerPendiente,
  quitarPendiente,
  marcarRecordatorioPendiente,
  upsertContacto,
  buscarContacto,
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
