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
// a usuario_id=1 (el owner). En un DB nuevo crea el schema directo.

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
const OWNER_WA_CUS   = process.env.OWNER_WA       || process.env.DIEGO_WA    || '541132317896@c.us';
const OWNER_EMAIL    = process.env.OWNER_EMAIL    || process.env.DIEGO_EMAIL || 'diego@paez.is';
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

CREATE TABLE IF NOT EXISTS notas_contacto (
  id                          INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id                  INTEGER NOT NULL REFERENCES usuarios(id),
  contacto_id                 INTEGER NOT NULL REFERENCES contactos(id),
  nota                        TEXT NOT NULL,
  eventos_sintetizados_hasta  INTEGER NOT NULL DEFAULT 0,
  creado                      DATETIME DEFAULT CURRENT_TIMESTAMP,
  actualizado                 DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (usuario_id, contacto_id)
);
CREATE INDEX IF NOT EXISTS idx_notas_contacto_user ON notas_contacto(usuario_id);

CREATE TABLE IF NOT EXISTS follow_ups (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  creado          DATETIME DEFAULT CURRENT_TIMESTAMP,
  usuario_id      INTEGER NOT NULL REFERENCES usuarios(id),
  descripcion     TEXT NOT NULL,
  esperando_de    TEXT NOT NULL,   -- wid o email del destinatario que tiene que responder
  esperando_canal TEXT NOT NULL CHECK(esperando_canal IN ('whatsapp','gmail')),
  vence_en        TEXT NOT NULL,   -- ISO timestamp UTC. Cuando llega, se dispara si no hubo respuesta.
  estado          TEXT NOT NULL DEFAULT 'abierto' CHECK(estado IN ('abierto','disparado','cerrado','cancelado')),
  disparado_en    DATETIME,
  cerrado_en      DATETIME,
  metadata_json   TEXT
);
CREATE INDEX IF NOT EXISTS idx_follow_ups_vence ON follow_ups(vence_en, estado);
CREATE INDEX IF NOT EXISTS idx_follow_ups_usr   ON follow_ups(usuario_id, estado);

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

// Migración: usuarios.calendar_acceso (none|read|write).
// Modela los 3 tiers de integración con calendar:
//   - 'none'  → tier 0: Maria no tiene acceso al calendar del user. Crea
//     eventos en su propio calendar e invita al user.
//   - 'read'  → tier 1: Maria puede leer el calendar del user (chequear
//     conflictos) pero no escribir. Crea eventos en su calendar e invita.
//   - 'write' → tier 2: Maria escribe directo en el calendar del user.
// Backfill: users existentes con calendar_id pasan a 'write' (asumimos que
// si lo configuraron históricamente, era con permisos full).
function _migrarUsuariosCalendarAcceso() {
  if (_tieneColumna('usuarios', 'calendar_acceso')) return;
  db.exec(`ALTER TABLE usuarios ADD COLUMN calendar_acceso TEXT NOT NULL DEFAULT 'none' CHECK(calendar_acceso IN ('none','read','write'))`);
  db.prepare(`UPDATE usuarios SET calendar_acceso = 'write' WHERE calendar_id IS NOT NULL AND calendar_id != ''`).run();
  console.log('[memory] migración: usuarios.calendar_acceso agregado (backfill write para users con calendar_id)');
}
_migrarUsuariosCalendarAcceso();

// Multi-provider calendar (design doc: docs/multi-provider-calendar.md):
//   - calendar_provider: 'google' (default, todos los users existentes) |
//                        'microsoft' (Fase 2) | 'caldav' (Fase 3)
//   - calendar_auth_json: blob cifrado con vault.js para credenciales del user
//                         en providers que requieren delegated access (microsoft,
//                         caldav). Google NO lo usa (usa OAuth global de Maria).
function _migrarUsuariosCalendarProvider() {
  if (!_tieneColumna('usuarios', 'calendar_provider')) {
    db.exec(`ALTER TABLE usuarios ADD COLUMN calendar_provider TEXT NOT NULL DEFAULT 'google' CHECK(calendar_provider IN ('google','microsoft','caldav'))`);
    console.log("[memory] migración: usuarios.calendar_provider agregado (default 'google')");
  }
  if (!_tieneColumna('usuarios', 'calendar_auth_json')) {
    db.exec(`ALTER TABLE usuarios ADD COLUMN calendar_auth_json TEXT`);
    console.log('[memory] migración: usuarios.calendar_auth_json agregado (NULL para Google)');
  }
}
_migrarUsuariosCalendarProvider();

// Modelo explícito de quién ejecuta un pendiente y qué lo dispara.
//   - dueno: 'usuario' (default, retrocompat) | 'maria'
//     · usuario  → el pendiente requiere acción/respuesta del usuario.
//     · maria    → Maria lo ejecuta sola, no pinguea al usuario.
//   - disparador: 'manual' (default) | 'respuesta_usuario' | 'trigger_externo'
//     · manual            → se ejecuta cuando alguien decida hacerlo.
//     · respuesta_usuario → Maria espera que el usuario conteste algo (ex 'consulta').
//     · trigger_externo   → se ejecuta cuando aparezca un evento externo (ej. tercero
//                            manda dato esperado). No pinguea — el LLM lo cierra solo.
//   - recordar_desde: si está seteado, el loop de recordatorios.js no pinguea hasta esa fecha.
// Backfill: pendientes existentes con meta_json.tipo='consulta' pasan a
// disparador='respuesta_usuario'; el resto queda en 'manual' (default).
// Combo inválido (maria, respuesta_usuario) lo evita el prompt del LLM, no el CHECK,
// porque agregar un CHECK compuesto requiere recrear la tabla.
function _migrarPendientesDuenoDisparador() {
  let cambios = false;
  if (!_tieneColumna('pendientes', 'dueno')) {
    db.exec(`ALTER TABLE pendientes ADD COLUMN dueno TEXT NOT NULL DEFAULT 'usuario' CHECK(dueno IN ('usuario','maria'))`);
    cambios = true;
  }
  if (!_tieneColumna('pendientes', 'disparador')) {
    db.exec(`ALTER TABLE pendientes ADD COLUMN disparador TEXT NOT NULL DEFAULT 'manual' CHECK(disparador IN ('manual','respuesta_usuario','trigger_externo'))`);
    // Backfill desde meta_json.tipo.
    const rows = db.prepare(`SELECT id, meta_json FROM pendientes WHERE estado='abierto' AND meta_json IS NOT NULL`).all();
    const upd = db.prepare(`UPDATE pendientes SET disparador = ? WHERE id = ?`);
    let n = 0;
    for (const r of rows) {
      try {
        const m = JSON.parse(r.meta_json);
        if (m && m.tipo === 'consulta') { upd.run('respuesta_usuario', r.id); n++; }
        // tipo='tarea' o ausente → manual (ya es default).
      } catch {}
    }
    if (n) console.log(`[memory] backfill: ${n} pendientes con meta.tipo='consulta' → disparador='respuesta_usuario'`);
    cambios = true;
  }
  if (!_tieneColumna('pendientes', 'recordar_desde')) {
    db.exec(`ALTER TABLE pendientes ADD COLUMN recordar_desde DATETIME`);
    cambios = true;
  }
  if (cambios) console.log('[memory] migración: pendientes.dueno/disparador/recordar_desde agregados');
}
_migrarPendientesDuenoDisparador();

// Suscripciones (intensa-api / LemonSqueezy):
//   - bienvenida_enviada: el loop de bienvenida de Maria dispara el primer WA cuando
//     un usuario fue insertado por el webhook de LS. Default 1 para usuarios pre-existentes
//     (no re-saludar a Diego et al).
//   - lemon_customer_id / lemon_subscription_id: trazabilidad cross-DB con control.sqlite
//   - cliente_id: FK soft a control.clientes.id (no enforceable, cross-DB)
function _migrarUsuariosLemonFields() {
  let cambios = false;
  if (!_tieneColumna('usuarios', 'bienvenida_enviada')) {
    db.exec(`ALTER TABLE usuarios ADD COLUMN bienvenida_enviada INTEGER NOT NULL DEFAULT 0`);
    db.prepare(`UPDATE usuarios SET bienvenida_enviada = 1`).run();
    console.log('[memory] migración: usuarios.bienvenida_enviada agregado, backfilled a 1 para usuarios existentes');
    cambios = true;
  }
  if (!_tieneColumna('usuarios', 'lemon_customer_id')) {
    db.exec(`ALTER TABLE usuarios ADD COLUMN lemon_customer_id TEXT`);
    cambios = true;
  }
  if (!_tieneColumna('usuarios', 'lemon_subscription_id')) {
    db.exec(`ALTER TABLE usuarios ADD COLUMN lemon_subscription_id TEXT`);
    cambios = true;
  }
  if (!_tieneColumna('usuarios', 'cliente_id')) {
    db.exec(`ALTER TABLE usuarios ADD COLUMN cliente_id INTEGER`);
    cambios = true;
  }
  if (cambios) console.log('[memory] migración: usuarios.bienvenida_enviada/lemon_*/cliente_id agregados');
}
_migrarUsuariosLemonFields();

// brief_activo: opt-out del morning-brief por usuario. Default 1 (recibe el
// brief matutino). Cuando un usuario pide "no me mandes mas el resumen diario"
// el action configurar_brief lo pone en 0; morning-brief.js lo respeta.
function _migrarUsuariosBriefActivo() {
  if (!_tieneColumna('usuarios', 'brief_activo')) {
    db.exec(`ALTER TABLE usuarios ADD COLUMN brief_activo INTEGER NOT NULL DEFAULT 1`);
    console.log('[memory] migracion: usuarios.brief_activo agregado (default 1)');
  }
}
_migrarUsuariosBriefActivo();

// Índices que dependen de usuario_id (los creamos acá porque en el exec inicial
// la columna podía no existir todavía en DBs viejos).
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_eventos_usuario     ON eventos(usuario_id, timestamp DESC);
  CREATE INDEX IF NOT EXISTS idx_prog_usuario        ON programados(usuario_id, enviado);
  CREATE INDEX IF NOT EXISTS idx_pendientes_usuario  ON pendientes(usuario_id, estado, creado);
`);

// `contactos` evoluciona en dos pasos:
//   v1: schema legacy global (sin usuario_id) o con UNIQUE table-constraint.
//   v2: por usuario, UNIQUE(usuario_id, nombre).
//   v3: + visibilidad ('privada'|'publica') + cumple. UNIQUE pasa a índices
//       parciales: privados (usuario_id, nombre); públicos (nombre).
//       Permite que dos usuarios tengan "Juan" privado distinto y a la vez
//       exista un único "Juan" público compartido.
function _migrarContactos() {
  // v3 desde cero (tabla nueva).
  if (!_tablaExiste('contactos')) {
    db.exec(`
      CREATE TABLE contactos (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id  INTEGER NOT NULL REFERENCES usuarios(id),
        nombre      TEXT NOT NULL,
        whatsapp    TEXT,
        email       TEXT,
        notas       TEXT,
        visibilidad TEXT NOT NULL DEFAULT 'privada' CHECK (visibilidad IN ('privada','publica')),
        cumple      TEXT,
        creado      DATETIME DEFAULT CURRENT_TIMESTAMP,
        actualizado DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_contactos_whatsapp    ON contactos(whatsapp);
      CREATE INDEX IF NOT EXISTS idx_contactos_email       ON contactos(email);
      CREATE INDEX IF NOT EXISTS idx_contactos_usuario     ON contactos(usuario_id, nombre);
      CREATE INDEX IF NOT EXISTS idx_contactos_visibilidad ON contactos(visibilidad, nombre);
      CREATE UNIQUE INDEX IF NOT EXISTS uniq_contactos_priv ON contactos(usuario_id, nombre) WHERE visibilidad = 'privada';
      CREATE UNIQUE INDEX IF NOT EXISTS uniq_contactos_pub  ON contactos(nombre)             WHERE visibilidad = 'publica';
    `);
    return;
  }
  const cols = db.prepare(`PRAGMA table_info(contactos)`).all();
  const tieneUsuario     = cols.some(c => c.name === 'usuario_id');
  const tieneVisibilidad = cols.some(c => c.name === 'visibilidad');
  const tieneCumple      = cols.some(c => c.name === 'cumple');

  // Detectar uniqueness compuesto inspeccionando los índices (v2 ya lo tiene).
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

  // Caso A: ya está en v3 (visibilidad + cumple + sin UNIQUE table-constraint).
  // Detectamos el UNIQUE table-constraint mirando si los índices únicos son
  // parciales (v3) o no (v2). Más simple: si tiene visibilidad y cumple,
  // asumimos v3 (la migración es idempotente y crearía los índices que falten).
  if (tieneUsuario && tieneVisibilidad && tieneCumple) {
    // Asegurar índices nuevos por si la tabla ya existía pero alguno faltaba.
    db.exec(`CREATE INDEX        IF NOT EXISTS idx_contactos_visibilidad ON contactos(visibilidad, nombre);`);
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS uniq_contactos_priv       ON contactos(usuario_id, nombre) WHERE visibilidad = 'privada';`);
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS uniq_contactos_pub        ON contactos(nombre)             WHERE visibilidad = 'publica';`);
    return;
  }

  // Caso B: hay que recrear (v1 → v3 o v2 → v3).
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
        visibilidad TEXT NOT NULL DEFAULT 'privada' CHECK (visibilidad IN ('privada','publica')),
        cumple      TEXT,
        creado      DATETIME DEFAULT CURRENT_TIMESTAMP,
        actualizado DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    // Copiar datos: si existe usuario_id la usamos; si no, todo al owner.
    // visibilidad arranca en 'privada' por default (decisión de Diego: lo
    // existente es todo privado). cumple se copia si la columna ya existía.
    const selectCumple = tieneCumple ? 'cumple' : 'NULL AS cumple';
    if (tieneUsuario) {
      db.exec(`INSERT INTO contactos_new (id, usuario_id, nombre, whatsapp, email, notas, cumple, creado, actualizado)
               SELECT id, COALESCE(usuario_id, ${OWNER_ID}), nombre, whatsapp, email, notas, ${selectCumple}, creado, actualizado FROM contactos`);
    } else {
      db.exec(`INSERT INTO contactos_new (id, usuario_id, nombre, whatsapp, email, notas, cumple, creado, actualizado)
               SELECT id, ${OWNER_ID}, nombre, whatsapp, email, notas, ${selectCumple}, creado, actualizado FROM contactos`);
    }
    db.exec('DROP TABLE contactos');
    db.exec('ALTER TABLE contactos_new RENAME TO contactos');
    db.exec(`CREATE INDEX IF NOT EXISTS idx_contactos_whatsapp    ON contactos(whatsapp)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_contactos_email       ON contactos(email)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_contactos_usuario     ON contactos(usuario_id, nombre)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_contactos_visibilidad ON contactos(visibilidad, nombre)`);
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS uniq_contactos_priv ON contactos(usuario_id, nombre) WHERE visibilidad = 'privada'`);
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS uniq_contactos_pub  ON contactos(nombre)             WHERE visibilidad = 'publica'`);
    db.exec('COMMIT');
    console.log('[memory] migración: contactos v3 (visibilidad + cumple, índices parciales)');
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

// Audit log de cada invocación a Claude. Va como evento sistema con
// metadata.tipo='claude_call' para poder filtrar después con
// `WHERE metadata_json LIKE '%claude_call%'` o un view dedicado.
function logClaudeCall({ usuarioId = null, canal = null, ms = null, prompt_chars = null, raw_chars = null, error_msg = null } = {}) {
  return log({
    usuarioId, canal: 'sistema', direccion: 'interno',
    cuerpo: `claude_call ${canal || '?'}: ${ms}ms prompt=${prompt_chars}c raw=${raw_chars}c${error_msg ? ' ERROR=' + error_msg.slice(0,80) : ''}`,
    metadata: { tipo: 'claude_call', canal, ms, prompt_chars, raw_chars, error_msg },
  });
}

// Log de evento de seguridad (detección de injection, intento de exfiltración, etc.).
// Siempre visible para el owner (canal=sistema).
function logSecurityEvent({ usuarioId = null, canal = null, motivo, body, extra = {} } = {}) {
  return log({
    usuarioId, canal: 'sistema', direccion: 'interno',
    cuerpo: `[SEGURIDAD] ${motivo}: ${(body || '').slice(0, 200)}`,
    metadata: { tipo: 'security', motivo, canal_origen: canal, body_full: body, ...extra },
  });
}

// ¿Existe un email entrante con este messageId en nuestro log?
// Usado para validar responder_email — previene que el LLM (jailbroken) invente
// un messageId y mande a un thread arbitrario. Solo retorna true si hubo un
// log con canal='gmail' direccion='entrante' que tenga ese messageId en su
// metadata. Sin filtro temporal: Diego puede responder un mail viejo.
const qExisteEmailEntrante = db.prepare(`
  SELECT 1 FROM eventos
  WHERE canal = 'gmail' AND direccion = 'entrante'
    AND metadata_json LIKE ?
  LIMIT 1
`);
function existeEmailEntrante(messageId) {
  if (!messageId) return false;
  // Defensa contra LIKE-injection (muy improbable, pero por las dudas).
  if (/[%_\\]/.test(messageId)) return false;
  const pat = `%"messageId":"${messageId}"%`;
  return !!qExisteEmailEntrante.get(pat);
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

// Búsqueda en el historial de eventos del usuario. Matchea por substring
// (case-insensitive) en `cuerpo`, `nombre`, `de` y `asunto`. Filtros opcionales
// por canal y ventana temporal. Resultados ordenados del más nuevo al más viejo.
//
// Args:
//   usuarioId: requerido — siempre filtra al bucket del usuario que pregunta
//   query:     requerido — substring a buscar (sin wildcards, se hace LIKE %x%)
//   canal:     opcional — 'whatsapp' | 'gmail' | 'calendar' | null (todos)
//   dias:      ventana hacia atrás, default 30, cap 365
//   max:       resultados, default 20, cap 100
//
// Devuelve array de filas hidratadas (con .metadata si tenían metadata_json).
const qBuscarEnHistorial = db.prepare(`
  SELECT id, timestamp, usuario_id, canal, direccion, de, nombre, asunto, cuerpo, metadata_json
  FROM eventos
  WHERE usuario_id = @usuarioId
    AND timestamp >= datetime('now', '-' || @dias || ' days')
    AND (@canal IS NULL OR canal = @canal)
    AND (
      cuerpo LIKE @q ESCAPE '\\'
      OR nombre LIKE @q ESCAPE '\\'
      OR de LIKE @q ESCAPE '\\'
      OR asunto LIKE @q ESCAPE '\\'
    )
  ORDER BY id DESC
  LIMIT @max
`);

function buscarEnHistorial({ usuarioId, query, canal = null, dias = 30, max = 20 } = {}) {
  if (!usuarioId || !query) return [];
  // Escapar wildcards LIKE para que se busque substring literal
  const safe = String(query).replace(/[\\%_]/g, '\\$&');
  const filas = qBuscarEnHistorial.all({
    usuarioId,
    q: `%${safe}%`,
    canal: canal || null,
    dias: Math.min(Math.max(1, dias), 365),
    max: Math.min(Math.max(1, max), 100),
  });
  return filas.map(hidratar);
}

// ─── Follow-ups ──────────────────────────────────────────────────────────
//
// Persistencia de follow-ups que el usuario pidió. El loop follow-ups.js
// se encarga del dispatch (chequear si vencieron y si el destino respondió).
// Estados: abierto → (disparado | cerrado | cancelado).

const insertFollowUp = db.prepare(`
  INSERT INTO follow_ups (usuario_id, descripcion, esperando_de, esperando_canal, vence_en, metadata_json)
  VALUES (@usuarioId, @descripcion, @esperando_de, @esperando_canal, @vence_en, @metadata_json)
`);

function crearFollowUp({ usuarioId, descripcion, esperandoDe, esperandoCanal = 'whatsapp', venceEn, metadata = null }) {
  if (!usuarioId || !descripcion || !esperandoDe || !venceEn) {
    throw new Error('crearFollowUp: usuarioId, descripcion, esperandoDe, venceEn requeridos');
  }
  if (!['whatsapp', 'gmail'].includes(esperandoCanal)) {
    throw new Error(`crearFollowUp: esperandoCanal inválido "${esperandoCanal}"`);
  }
  const info = insertFollowUp.run({
    usuarioId,
    descripcion: String(descripcion),
    esperando_de: String(esperandoDe),
    esperando_canal: esperandoCanal,
    vence_en: String(venceEn),
    metadata_json: metadata ? JSON.stringify(metadata) : null,
  });
  return info.lastInsertRowid;
}

const qFollowUpsAbiertosVencidos = db.prepare(`
  SELECT * FROM follow_ups
  WHERE estado = 'abierto' AND vence_en <= datetime('now')
  ORDER BY vence_en ASC
`);
const qFollowUpsAbiertosUsuario = db.prepare(`
  SELECT * FROM follow_ups
  WHERE usuario_id = ? AND estado = 'abierto'
  ORDER BY vence_en ASC
`);
const updateFollowUpEstado = db.prepare(`
  UPDATE follow_ups
  SET estado = ?, disparado_en = CASE WHEN ?='disparado' THEN CURRENT_TIMESTAMP ELSE disparado_en END,
      cerrado_en = CASE WHEN ? IN ('cerrado','cancelado') THEN CURRENT_TIMESTAMP ELSE cerrado_en END
  WHERE id = ?
`);

function followUpsVencidos() {
  return qFollowUpsAbiertosVencidos.all().map(hidratar);
}
function followUpsAbiertos(usuarioId) {
  return qFollowUpsAbiertosUsuario.all(usuarioId).map(hidratar);
}
function setFollowUpEstado(id, estado) {
  if (!['abierto', 'disparado', 'cerrado', 'cancelado'].includes(estado)) {
    throw new Error(`setFollowUpEstado: estado inválido "${estado}"`);
  }
  updateFollowUpEstado.run(estado, estado, estado, id);
}

/**
 * ¿Hubo mensaje entrante de `esperandoDe` en el bucket del usuario después
 * de `desde` (timestamp ISO o Date)? Usado por el loop de follow-ups para
 * decidir si cerrar o disparar.
 */
const qEntranteDespuesDe = db.prepare(`
  SELECT 1 FROM eventos
  WHERE usuario_id = ? AND canal = ? AND direccion = 'entrante'
    AND de = ? AND timestamp >= ?
  LIMIT 1
`);
function huboRespuesta({ usuarioId, esperandoDe, esperandoCanal, desde }) {
  const desdeStr = desde instanceof Date ? desde.toISOString().replace('T',' ').slice(0,19) : String(desde);
  return !!qEntranteDespuesDe.get(usuarioId, esperandoCanal, esperandoDe, desdeStr);
}

// ─── Memoria curada: notas por (usuario × contacto) ───────────────────────
//
// Sintetiza interacciones de un usuario con un contacto en una nota acumulativa.
// Se inyecta al prompt cuando el contacto está en el contexto activo.
// El job de curación (memoria-curada.js) corre nightly.

const qNotaContacto = db.prepare(`
  SELECT * FROM notas_contacto WHERE usuario_id = ? AND contacto_id = ?
`);
const qNotasContactoDeUsuario = db.prepare(`
  SELECT n.*, c.nombre AS contacto_nombre, c.whatsapp AS contacto_whatsapp, c.email AS contacto_email
  FROM notas_contacto n JOIN contactos c ON c.id = n.contacto_id
  WHERE n.usuario_id = ?
  ORDER BY n.actualizado DESC
`);
const upsertNotaContactoStmt = db.prepare(`
  INSERT INTO notas_contacto (usuario_id, contacto_id, nota, eventos_sintetizados_hasta)
  VALUES (@usuarioId, @contactoId, @nota, @hasta)
  ON CONFLICT(usuario_id, contacto_id) DO UPDATE SET
    nota = excluded.nota,
    eventos_sintetizados_hasta = excluded.eventos_sintetizados_hasta,
    actualizado = CURRENT_TIMESTAMP
`);

function getNotaContacto(usuarioId, contactoId) {
  return qNotaContacto.get(usuarioId, contactoId) || null;
}
function listarNotasContactoDeUsuario(usuarioId) {
  return qNotasContactoDeUsuario.all(usuarioId);
}
function upsertNotaContacto({ usuarioId, contactoId, nota, hasta }) {
  upsertNotaContactoStmt.run({ usuarioId, contactoId, nota, hasta });
}

// Eventos en el bucket del usuario asociables a un contacto desde un id
// determinado en adelante. Asocia por: whatsapp (LIKE digits) o email (LIKE).
// Devuelve filas hidratadas, ordenadas asc por id.
function eventosConContactoDesde({ usuarioId, contacto, desdeEventId = 0, max = 200 }) {
  const wa = contacto && contacto.whatsapp ? String(contacto.whatsapp).replace(/\D/g, '') : null;
  const email = contacto && contacto.email ? String(contacto.email).toLowerCase() : null;
  if (!wa && !email) return [];

  // Armamos LIKE sobre `de` por dígitos (cubre @c.us y @lid si el LID
  // contiene dígitos del número). Para email, LIKE case-insensitive.
  const stmt = db.prepare(`
    SELECT id, timestamp, usuario_id, canal, direccion, de, nombre, asunto, cuerpo, metadata_json
    FROM eventos
    WHERE usuario_id = @usuarioId
      AND id > @desde
      AND (
        (@wa IS NOT NULL AND REPLACE(REPLACE(REPLACE(de, '@c.us', ''), '@lid', ''), '+', '') LIKE '%' || @wa || '%')
        OR (@email IS NOT NULL AND LOWER(de) LIKE '%' || @email || '%')
        OR (@email IS NOT NULL AND LOWER(asunto) LIKE '%' || @email || '%')
      )
    ORDER BY id ASC
    LIMIT @max
  `);
  const filas = stmt.all({
    usuarioId,
    desde: desdeEventId,
    wa,
    email,
    max: Math.min(Math.max(1, max), 500),
  });
  return filas.map(hidratar);
}

function formatearParaPrompt(e) {
  const ts = e.timestamp;
  const flecha = e.direccion === 'entrante' ? '→' : (e.direccion === 'saliente' ? '←' : '·');
  const quien = e.nombre || e.de || '?';
  const cuerpo = (e.cuerpo || '').replace(/\s+/g, ' ').slice(0, 300);
  if (e.canal === 'gmail')    return `[${ts}] ${flecha} GMAIL ${quien} | "${e.asunto || ''}" | ${cuerpo}`;
  if (e.canal === 'calendar') return `[${ts}] ${flecha} CAL ${quien} | ${cuerpo}`;
  if (e.canal === 'sistema')  return `[${ts}] · SIS ${cuerpo}`;
  // WhatsApp: si es un mensaje con media, exponer el wa_msg_id explícito al
  // final para que el LLM pueda emitir reenviar_wa con el id correcto.
  // Preferimos mediaMessageId si está presente (caso unknown-flow: el evento
  // se loggea con messageId del routeo, y por separado se persiste el id del
  // mensaje con media en mediaMessageId).
  let suffix = '';
  if (e.metadata?.esMedia) {
    const waMsgId = e.metadata.mediaMessageId || e.metadata.messageId;
    if (waMsgId) suffix = ` [wa_msg_id=${waMsgId}]`;
  }
  return `[${ts}] ${flecha} WA ${quien}: ${cuerpo}${suffix}`;
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
  // Estos viajan como columnas propias, no van al meta_json:
  'dueno', 'disparador', 'recordar_desde', 'tipo',
]);

const DUENOS_VALIDOS = new Set(['usuario', 'maria']);
const DISPARADORES_VALIDOS = new Set(['manual', 'respuesta_usuario', 'trigger_externo']);

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
    dueno: row.dueno || 'usuario',
    disparador: row.disparador || 'manual',
    recordar_desde: row.recordar_desde || null,
    meta,
  };
}

const insertPendiente = db.prepare(`
  INSERT INTO pendientes (
    usuario_id, desc, dueno, disparador,
    remitente, canal_origen, destino_wa, destino_email, email_message_id, meta_json
  ) VALUES (
    @usuario_id, @desc, @dueno, @disparador,
    @remitente, @canal_origen, @destino_wa, @destino_email, @email_message_id, @meta_json
  )
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
const posponerPendienteStmt = db.prepare(`
  UPDATE pendientes SET recordar_desde = ? WHERE id = ?
`);

function agregarPendiente(usuarioId, desc, meta = {}) {
  if (!usuarioId) throw new Error('agregarPendiente: usuarioId requerido');
  if (!desc) throw new Error('agregarPendiente: desc requerido');

  const dueno = meta.dueno || 'usuario';
  const disparador = meta.disparador || (meta.tipo === 'consulta' ? 'respuesta_usuario' : 'manual');
  if (!DUENOS_VALIDOS.has(dueno)) {
    throw new Error(`agregarPendiente: dueno inválido (${dueno}). Valores: usuario | maria`);
  }
  if (!DISPARADORES_VALIDOS.has(disparador)) {
    throw new Error(`agregarPendiente: disparador inválido (${disparador}). Valores: manual | respuesta_usuario | trigger_externo`);
  }
  if (dueno === 'maria' && disparador === 'respuesta_usuario') {
    throw new Error('agregarPendiente: combo inválido (dueno=maria + disparador=respuesta_usuario). Maria no se pregunta a sí misma.');
  }

  const { conocidos, resto } = _descomponerMeta(meta);
  const info = insertPendiente.run({
    usuario_id: usuarioId,
    desc,
    dueno,
    disparador,
    ...conocidos,
    meta_json: Object.keys(resto).length ? JSON.stringify(resto) : null,
  });
  return info.lastInsertRowid;
}

/**
 * Posterga el próximo ping de recordatorios para un pendiente hasta `hastaISO`.
 * Solo tiene efecto para pendientes que entran al loop (dueno='usuario' y
 * disparador ∈ {manual, respuesta_usuario}); para tarea_condicional el loop
 * lo ignora igual.
 */
function posponerPendiente(usuarioId, id, hastaISO) {
  if (!usuarioId) throw new Error('posponerPendiente: usuarioId requerido');
  if (!id) throw new Error('posponerPendiente: id requerido');
  if (!hastaISO) throw new Error('posponerPendiente: hastaISO requerido');
  const row = qPendientePorId.get(id);
  if (!row) return null;
  if (row.usuario_id !== usuarioId) return null; // aislamiento
  if (row.estado !== 'abierto') return null;
  posponerPendienteStmt.run(hastaISO, id);
  return _rehidratarPendiente(qPendientePorId.get(id));
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

// upsert distinto por visibilidad: el ON CONFLICT debe matchear el índice
// parcial correcto, así que tenemos dos statements paralelos.
const insertContactoPriv = db.prepare(`
  INSERT INTO contactos (usuario_id, nombre, whatsapp, email, notas, visibilidad, cumple)
  VALUES (@usuario_id, @nombre, @whatsapp, @email, @notas, 'privada', @cumple)
  ON CONFLICT(usuario_id, nombre) WHERE visibilidad = 'privada' DO UPDATE SET
    whatsapp = COALESCE(excluded.whatsapp, contactos.whatsapp),
    email    = COALESCE(excluded.email,    contactos.email),
    notas    = COALESCE(excluded.notas,    contactos.notas),
    cumple   = COALESCE(excluded.cumple,   contactos.cumple),
    actualizado = CURRENT_TIMESTAMP
`);
const insertContactoPub = db.prepare(`
  INSERT INTO contactos (usuario_id, nombre, whatsapp, email, notas, visibilidad, cumple)
  VALUES (@usuario_id, @nombre, @whatsapp, @email, @notas, 'publica', @cumple)
  ON CONFLICT(nombre) WHERE visibilidad = 'publica' DO UPDATE SET
    whatsapp = COALESCE(excluded.whatsapp, contactos.whatsapp),
    email    = COALESCE(excluded.email,    contactos.email),
    notas    = COALESCE(excluded.notas,    contactos.notas),
    cumple   = COALESCE(excluded.cumple,   contactos.cumple),
    actualizado = CURRENT_TIMESTAMP
`);

const qContactoPorNombrePriv   = db.prepare(`SELECT * FROM contactos WHERE usuario_id = ? AND nombre = ? COLLATE NOCASE AND visibilidad = 'privada'`);
const qContactoPorNombrePub    = db.prepare(`SELECT * FROM contactos WHERE                 nombre = ? COLLATE NOCASE AND visibilidad = 'publica'`);
const qContactoPorWhatsappPriv = db.prepare(`SELECT * FROM contactos WHERE usuario_id = ? AND whatsapp = ?       AND visibilidad = 'privada'`);
const qContactoPorWhatsappPub  = db.prepare(`SELECT * FROM contactos WHERE                 whatsapp = ?       AND visibilidad = 'publica'`);
const qContactoPorEmailPriv    = db.prepare(`SELECT * FROM contactos WHERE usuario_id = ? AND email = ? COLLATE NOCASE AND visibilidad = 'privada'`);
const qContactoPorEmailPub     = db.prepare(`SELECT * FROM contactos WHERE                 email = ? COLLATE NOCASE AND visibilidad = 'publica'`);
const qContactosPriv           = db.prepare(`SELECT * FROM contactos WHERE usuario_id = ? AND visibilidad = 'privada' ORDER BY nombre COLLATE NOCASE`);
const qContactosPub            = db.prepare(`SELECT * FROM contactos WHERE                 visibilidad = 'publica' ORDER BY nombre COLLATE NOCASE`);
const qContactoPorIdYUsuario   = db.prepare(`SELECT * FROM contactos WHERE id = ? AND (visibilidad = 'publica' OR usuario_id = ?)`);
const qContactoPorId           = db.prepare(`SELECT * FROM contactos WHERE id = ?`);
const updVisibilidad           = db.prepare(`UPDATE contactos SET visibilidad = ?, actualizado = CURRENT_TIMESTAMP WHERE id = ?`);
const updCumple                = db.prepare(`UPDATE contactos SET cumple = ?,      actualizado = CURRENT_TIMESTAMP WHERE id = ?`);

function upsertContacto({ usuarioId, nombre, whatsapp = null, email = null, notas = null, visibilidad = 'privada', cumple = null }) {
  if (!usuarioId) throw new Error('upsertContacto: usuarioId requerido');
  if (!nombre) throw new Error('upsertContacto: nombre requerido');
  if (visibilidad !== 'privada' && visibilidad !== 'publica') {
    throw new Error(`upsertContacto: visibilidad inválida "${visibilidad}" (esperado: privada|publica)`);
  }
  // Sanitizer: el @lid es un identificador rotativo de WA, no es estable.
  if (whatsapp && typeof whatsapp === 'string' && whatsapp.endsWith('@lid')) {
    console.warn(`[upsertContacto] descarto whatsapp=@lid para "${nombre}" (no es estable)`);
    whatsapp = null;
  }
  const params = { usuario_id: usuarioId, nombre, whatsapp, email, notas, cumple };
  if (visibilidad === 'privada') {
    insertContactoPriv.run(params);
    return qContactoPorNombrePriv.get(usuarioId, nombre);
  } else {
    insertContactoPub.run(params);
    return qContactoPorNombrePub.get(nombre);
  }
}

// Búsqueda canónica para un usuario: privada primero, después pública.
// Si pasás { incluirPublica: false } solo busca en privada del usuario.
function buscarContacto({ usuarioId, nombre, whatsapp, email, incluirPublica = true } = {}) {
  if (!usuarioId) throw new Error('buscarContacto: usuarioId requerido');
  let priv = null, pub = null;
  if (nombre) {
    priv = qContactoPorNombrePriv.get(usuarioId, nombre);
    if (incluirPublica) pub = qContactoPorNombrePub.get(nombre);
  } else if (whatsapp) {
    priv = qContactoPorWhatsappPriv.get(usuarioId, whatsapp);
    if (incluirPublica) pub = qContactoPorWhatsappPub.get(whatsapp);
  } else if (email) {
    priv = qContactoPorEmailPriv.get(usuarioId, email);
    if (incluirPublica) pub = qContactoPorEmailPub.get(email);
  }
  return priv || pub || null; // privada gana
}

// Lista TODO lo visible para un usuario: sus privados + públicos de cualquiera.
function todosLosContactos(usuarioId) {
  if (!usuarioId) throw new Error('todosLosContactos: usuarioId requerido');
  const priv = qContactosPriv.all(usuarioId);
  const pub  = qContactosPub.all();
  return [...priv, ...pub];
}

// Splits separados (útil para el prompt-builder y para listarlos al usuario).
function contactosPrivados(usuarioId) {
  if (!usuarioId) throw new Error('contactosPrivados: usuarioId requerido');
  return qContactosPriv.all(usuarioId);
}
function contactosPublicos() {
  return qContactosPub.all();
}

// Cambiar visibilidad de un contacto. Acepta el id del contacto o un criterio
// de búsqueda dentro de lo visible para el usuario. Cualquier usuario activo
// puede flippear (decisión de diseño confirmada). Si el contacto era privado
// de otro usuario, NO lo flippeamos a su privado nuestro — solo flippeamos
// privados propios o públicos.
function cambiarVisibilidadContacto({ usuarioId, contactoId, nombre, whatsapp, email, visibilidad }) {
  if (!usuarioId) throw new Error('cambiarVisibilidad: usuarioId requerido');
  if (visibilidad !== 'privada' && visibilidad !== 'publica') {
    throw new Error(`cambiarVisibilidad: visibilidad inválida "${visibilidad}"`);
  }
  let c = null;
  if (contactoId) {
    c = qContactoPorIdYUsuario.get(contactoId, usuarioId);
  } else {
    c = buscarContacto({ usuarioId, nombre, whatsapp, email });
  }
  if (!c) return null;
  // Solo permitir flippear si es privado nuestro o público de cualquiera.
  if (c.visibilidad === 'privada' && c.usuario_id !== usuarioId) {
    throw new Error(`cambiarVisibilidad: el contacto "${c.nombre}" es privado de otro usuario; no podés modificarlo`);
  }
  if (c.visibilidad === visibilidad) return c; // no-op
  // Si flippeamos a público, hay que verificar que no exista ya un público
  // con ese nombre (el índice único parcial lo va a impedir igual, pero
  // damos un error más claro).
  if (visibilidad === 'publica') {
    const yaExiste = qContactoPorNombrePub.get(c.nombre);
    if (yaExiste && yaExiste.id !== c.id) {
      throw new Error(`cambiarVisibilidad: ya existe un contacto público con nombre "${c.nombre}" (id=${yaExiste.id})`);
    }
  }
  updVisibilidad.run(visibilidad, c.id);
  return qContactoPorId.get(c.id);
}

// Setea el cumpleaños de un contacto. Si no existe, lo crea privado del usuario
// solo con (nombre, cumple). Acepta cumple en YYYY-MM-DD o --MM-DD.
function setCumpleContacto({ usuarioId, contactoId, nombre, whatsapp, email, cumple }) {
  if (!usuarioId) throw new Error('setCumple: usuarioId requerido');
  if (!cumple) throw new Error('setCumple: cumple requerido');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cumple) && !/^--\d{2}-?\d{2}$/.test(cumple)) {
    throw new Error(`setCumple: formato inválido "${cumple}" (esperado YYYY-MM-DD o --MM-DD)`);
  }
  // Normalizar --MMDD → --MM-DD (vCard 4.0 admite ambos).
  if (/^--\d{4}$/.test(cumple)) cumple = `--${cumple.slice(2,4)}-${cumple.slice(4,6)}`;
  let c = null;
  if (contactoId) {
    c = qContactoPorIdYUsuario.get(contactoId, usuarioId);
  } else {
    c = buscarContacto({ usuarioId, nombre, whatsapp, email });
  }
  if (!c) {
    // Crear contacto privado mínimo con el cumple.
    if (!nombre) throw new Error('setCumple: contacto no existe y no pasaste nombre para crearlo');
    return upsertContacto({ usuarioId, nombre, whatsapp, email, cumple, visibilidad: 'privada' });
  }
  if (c.visibilidad === 'privada' && c.usuario_id !== usuarioId) {
    throw new Error(`setCumple: el contacto "${c.nombre}" es privado de otro usuario; no podés modificarlo`);
  }
  updCumple.run(cumple, c.id);
  return qContactoPorId.get(c.id);
}

// Cumpleañeros visibles para un usuario en una fecha (mes, dia 1-12 / 1-31).
// Matchea cumple YYYY-MM-DD por mes/día y --MM-DD por mes/día.
const qCumplesPriv = db.prepare(`
  SELECT * FROM contactos
  WHERE usuario_id = ? AND cumple IS NOT NULL AND visibilidad = 'privada'
    AND (substr(cumple, -5) = ? OR substr(cumple, -5) = ?)
`);
const qCumplesPub = db.prepare(`
  SELECT * FROM contactos
  WHERE cumple IS NOT NULL AND visibilidad = 'publica'
    AND (substr(cumple, -5) = ? OR substr(cumple, -5) = ?)
`);
function cumpleañerosDelDia({ usuarioId, mes, dia }) {
  if (!usuarioId) throw new Error('cumpleañerosDelDia: usuarioId requerido');
  const mm = String(mes).padStart(2, '0');
  const dd = String(dia).padStart(2, '0');
  const key = `${mm}-${dd}`; // matchea "2025-03-15".slice(-5) y "--03-15".slice(-5)
  const priv = qCumplesPriv.all(usuarioId, key, key);
  const pub  = qCumplesPub.all(key, key);
  return [...priv, ...pub];
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
const updProgramadoPausado   = db.prepare(`UPDATE programados SET enviado = -2 WHERE id = ?`);
const updProgramadoMetadata  = db.prepare(`UPDATE programados SET metadata_json = ? WHERE id = ?`);
const qProgramadoPorId       = db.prepare(`SELECT * FROM programados WHERE id = ?`);

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
function pausarProgramado(id)        { updProgramadoPausado.run(id); }

// Mergea `patch` con el metadata_json actual del programado y persiste.
// Devuelve el nuevo metadata como objeto. Si el id no existe, tira.
function actualizarMetadataProgramado(id, patch) {
  const row = qProgramadoPorId.get(id);
  if (!row) throw new Error(`actualizarMetadataProgramado: id=${id} no existe`);
  let cur = {};
  try { cur = row.metadata_json ? JSON.parse(row.metadata_json) : {}; } catch { cur = {}; }
  const merged = { ...cur, ...patch };
  updProgramadoMetadata.run(JSON.stringify(merged), id);
  return merged;
}

function obtenerProgramado(id) {
  const r = qProgramadoPorId.get(id);
  return r ? hidratar(r) : null;
}

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
  logClaudeCall,
  logSecurityEvent,
  existeEmailEntrante,
  recientes,
  porCanal,
  porContacto,
  desdeHoras,
  contextoCrossCanal,
  buscarEnHistorial,
  formatearParaPrompt,
  // follow-ups
  crearFollowUp,
  followUpsVencidos,
  followUpsAbiertos,
  setFollowUpEstado,
  huboRespuesta,
  // memoria curada
  getNotaContacto,
  listarNotasContactoDeUsuario,
  upsertNotaContacto,
  eventosConContactoDesde,
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
  posponerPendiente,
  // contactos
  upsertContacto,
  buscarContacto,
  buscarContactoCrossUsuario,
  todosLosContactos,
  contactosPrivados,
  contactosPublicos,
  cambiarVisibilidadContacto,
  setCumpleContacto,
  cumpleañerosDelDia,
  importarDesdeContactosJson,
  // programados
  programarMensaje,
  programadosDebidos,
  proximosProgramados,
  existeProgramadoFuturo,
  marcarProgramadoEnviado,
  pausarProgramado,
  actualizarMetadataProgramado,
  obtenerProgramado,
  cancelarProgramado,
  // hechos
  recordarHecho,
  olvidarHecho,
  listarHechos,
};
