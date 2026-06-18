// db.js — wrappers de SQLite con better-sqlite3. Inicializa schema si no existe.

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const CONTROL_DB = process.env.CONTROL_DB || '/root/secretaria/state/control/control.sqlite';
const ARCHIVE_DB = process.env.ARCHIVE_DB || '/root/secretaria/state/control/archive.sqlite';

let _control, _archive;

function _open(dbPath, schemaPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  const schema = fs.readFileSync(path.join(__dirname, '..', schemaPath), 'utf8');
  db.exec(schema);
  return db;
}

// Migraciones sobre DBs ya existentes. schema.sql usa CREATE TABLE IF NOT EXISTS,
// que no agrega columnas a tablas viejas — acá van los ALTER idempotentes.
function _migrarControl(db) {
  const cols = db.prepare(`PRAGMA table_info(portal_otp)`).all().map(c => c.name);
  if (!cols.includes('proposito')) {
    db.exec(`ALTER TABLE portal_otp ADD COLUMN proposito TEXT NOT NULL DEFAULT 'login'`);
    console.log(`[db] migración: portal_otp.proposito agregada`);
  }
  const spCols = db.prepare(`PRAGMA table_info(signup_pending)`).all().map(c => c.name);
  if (!spCols.includes('idioma')) {
    db.exec(`ALTER TABLE signup_pending ADD COLUMN idioma TEXT NOT NULL DEFAULT 'es'`);
    console.log(`[db] migración: signup_pending.idioma agregada`);
  }
}

function init() {
  _control = _open(CONTROL_DB, 'schema.sql');
  _archive = _open(ARCHIVE_DB, 'schema-archive.sql');
  _migrarControl(_control);
  console.log(`[db] control=${CONTROL_DB}  archive=${ARCHIVE_DB}`);
}

function close() {
  if (_control) _control.close();
  if (_archive) _archive.close();
}

function control() { return _control; }
function archive() { return _archive; }

module.exports = { init, close, control, archive };
