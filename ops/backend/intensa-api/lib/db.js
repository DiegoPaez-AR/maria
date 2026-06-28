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
  const colsSignup = db.prepare(`PRAGMA table_info(signup_pending)`).all().map(c => c.name);
  if (!colsSignup.includes('reenviado_en')) {
    db.exec(`ALTER TABLE signup_pending ADD COLUMN reenviado_en DATETIME`);
    console.log(`[db] migración: signup_pending.reenviado_en agregada`);
  }

  // Migración a Stripe: columnas stripe_* en clientes (las lemon_* quedan para
  // registros viejos/archive). El UNIQUE va por índice parcial porque SQLite no
  // permite ALTER ADD COLUMN ... UNIQUE.
  const colsCli = db.prepare(`PRAGMA table_info(clientes)`).all().map(c => c.name);
  if (!colsCli.includes('stripe_customer_id')) {
    db.exec(`ALTER TABLE clientes ADD COLUMN stripe_customer_id TEXT`);
    console.log(`[db] migración: clientes.stripe_customer_id agregada`);
  }
  if (!colsCli.includes('stripe_subscription_id')) {
    db.exec(`ALTER TABLE clientes ADD COLUMN stripe_subscription_id TEXT`);
    console.log(`[db] migración: clientes.stripe_subscription_id agregada`);
  }
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_clientes_stripe_sub ON clientes(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL`);
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
