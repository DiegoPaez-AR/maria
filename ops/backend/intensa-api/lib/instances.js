// instances.js — discovery de instancias activas + asignación round-robin por capacidad.

const fs = require('fs');
const path = require('path');
const db = require('./db');

const BOOTSTRAP_FILE = process.env.INSTANCES_BOOTSTRAP_FILE
  || '/root/secretaria/config/instances.bootstrap.json';

/**
 * Si la tabla `instances` está vacía, leer el JSON de bootstrap (si existe)
 * y poblar. Útil al primer arranque o cuando agregamos una Maria nueva.
 *
 * Formato esperado del JSON:
 *   [
 *     { "slug": "maria-paez", "nombre": "Maria Paez", "internal_port": 4501,
 *       "internal_secret": "...", "max_usuarios": 25, "signup_bot": 1 }
 *   ]
 */
function bootstrapIfNeeded() {
  const c = db.control();
  const count = c.prepare(`SELECT COUNT(*) AS n FROM instances`).get().n;
  if (count > 0) {
    console.log(`[instances] ${count} ya cargadas en DB, skip bootstrap`);
    return;
  }
  if (!fs.existsSync(BOOTSTRAP_FILE)) {
    console.warn(`[instances] no hay instancias en DB y no existe ${BOOTSTRAP_FILE} — el servicio NO va a poder asignar clientes nuevos.`);
    return;
  }
  const raw = JSON.parse(fs.readFileSync(BOOTSTRAP_FILE, 'utf8'));
  if (!Array.isArray(raw)) throw new Error('bootstrap file debe ser un array JSON');
  const ins = c.prepare(`
    INSERT INTO instances (slug, nombre, host, internal_port, internal_secret, max_usuarios, signup_bot, estado)
    VALUES (@slug, @nombre, @host, @internal_port, @internal_secret, @max_usuarios, @signup_bot, 'active')
  `);
  let n = 0;
  for (const i of raw) {
    ins.run({
      slug: i.slug,
      nombre: i.nombre,
      host: i.host || '127.0.0.1',
      internal_port: i.internal_port,
      internal_secret: i.internal_secret,
      max_usuarios: i.max_usuarios || 25,
      signup_bot: i.signup_bot ? 1 : 0,
    });
    n++;
  }
  console.log(`[instances] bootstrap: ${n} instancias importadas desde ${BOOTSTRAP_FILE}`);
}

function listActive() {
  return db.control().prepare(`
    SELECT * FROM instances WHERE estado='active' ORDER BY slug
  `).all();
}

function get(slug) {
  return db.control().prepare(`SELECT * FROM instances WHERE slug=?`).get(slug);
}

function signupBot() {
  return db.control().prepare(`
    SELECT * FROM instances WHERE signup_bot=1 AND estado='active' LIMIT 1
  `).get();
}

/**
 * Asigna una instancia a un cliente nuevo. Retorna la instancia con MÁS cupo
 * disponible (max_usuarios - usuarios_actuales). Si todas están llenas o
 * en maintenance/offline, retorna null.
 */
function assignBestInstance() {
  const activas = listActive();
  let best = null;
  let bestCupo = 0;
  for (const i of activas) {
    const cupo = i.max_usuarios - i.usuarios_actuales;
    if (cupo > bestCupo) {
      best = i;
      bestCupo = cupo;
    }
  }
  return best;
}

function incrementarUsuarios(slug) {
  db.control().prepare(`
    UPDATE instances SET usuarios_actuales = usuarios_actuales + 1, actualizado = datetime('now') WHERE slug=?
  `).run(slug);
}

function decrementarUsuarios(slug) {
  db.control().prepare(`
    UPDATE instances SET usuarios_actuales = MAX(0, usuarios_actuales - 1), actualizado = datetime('now') WHERE slug=?
  `).run(slug);
}

module.exports = { bootstrapIfNeeded, listActive, get, signupBot, assignBestInstance, incrementarUsuarios, decrementarUsuarios };
