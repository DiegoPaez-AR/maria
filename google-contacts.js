// google-contacts.js — replica la libreta de Maria a Google Contacts
// (People API) para que el teléfono dedicado (WA v2 / AutoResponder) tenga
// SIEMPRE los nombres canónicos de la libreta. 2026-08-03, pedido de Diego.
//
// La fuente de verdad es la tabla `contactos`; Google/el teléfono son
// réplicas. Mapping contacto_id → resourceName en gcontacts_sync (ids
// NEGATIVOS = usuarios, que también se replican para que sus nombres se
// vean en las notificaciones de WhatsApp).

const { google } = require('googleapis');
const mem = require('./memory');

let _gmod = null;
async function _auth() {
  if (!_gmod) _gmod = require('./google');
  return _gmod.autenticar();
}

mem.db.exec(`CREATE TABLE IF NOT EXISTS gcontacts_sync (
  contacto_id   INTEGER PRIMARY KEY,
  resource_name TEXT NOT NULL,
  actualizado   DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

const CAMPOS = 'names,phoneNumbers,emailAddresses,biographies,birthdays';

function _cumpleADate(cumple) {
  // Formatos de la libreta: YYYY-MM-DD o --MM-DD (sin año)
  const m = String(cumple || '').match(/^(?:(\d{4})|-)?-?(\d{2})-(\d{2})$/);
  if (!m) return null;
  const date = { month: Number(m[2]), day: Number(m[3]) };
  if (m[1]) date.year = Number(m[1]);
  if (!date.month || !date.day || date.month > 12 || date.day > 31) return null;
  return date;
}

function _cuerpo(c, dueno) {
  const notas = [];
  if (c.notas) notas.push(String(c.notas));
  if (c.perfil_web) notas.push('— Perfil: ' + String(c.perfil_web).slice(0, 600));
  if (dueno) notas.push(`(libreta de ${dueno})`);
  const digs = String(c.whatsapp || '').replace(/\D/g, '');
  const cumpleDate = _cumpleADate(c.cumple);
  return {
    names: [{ givenName: String(c.nombre) }],
    ...(digs ? { phoneNumbers: [{ value: '+' + digs }] } : {}),
    ...(c.email ? { emailAddresses: [{ value: c.email }] } : {}),
    ...(cumpleDate ? { birthdays: [{ date: cumpleDate }] } : {}),
    ...(notas.length ? { biographies: [{ value: notas.join('\n'), contentType: 'TEXT_PLAIN' }] } : {}),
  };
}

async function sincronizarContacto(c, { dueno = null } = {}) {
  if (!c || !c.id || !c.nombre) throw new Error('sincronizarContacto: contacto con id y nombre requerido');
  const auth = await _auth();
  const people = google.people({ version: 'v1', auth });
  const body = _cuerpo(c, dueno);
  const map = mem.db.prepare('SELECT resource_name FROM gcontacts_sync WHERE contacto_id = ?').get(c.id);
  if (map) {
    const person = await people.people.get({ resourceName: map.resource_name, personFields: 'names' }).catch(() => null);
    if (person && person.data && person.data.etag) {
      await people.people.updateContact({
        resourceName: map.resource_name,
        updatePersonFields: CAMPOS,
        requestBody: { etag: person.data.etag, ...body },
      });
      mem.db.prepare('UPDATE gcontacts_sync SET actualizado = CURRENT_TIMESTAMP WHERE contacto_id = ?').run(c.id);
      return { actualizado: true };
    }
    mem.db.prepare('DELETE FROM gcontacts_sync WHERE contacto_id = ?').run(c.id); // resource borrado a mano → recrear
  }
  const r = await people.people.createContact({ requestBody: body, personFields: CAMPOS });
  mem.db.prepare('INSERT OR REPLACE INTO gcontacts_sync (contacto_id, resource_name) VALUES (?, ?)').run(c.id, r.data.resourceName);
  return { creado: true };
}

async function sincronizarUsuario(u) {
  const NOMBRE = process.env.ASISTENTE_NOMBRE || 'Maria';
  return sincronizarContacto({
    id: -u.id, // ids negativos = usuarios en gcontacts_sync
    nombre: u.nombre,
    whatsapp: u.wa_cus || null,
    email: u.email || null,
    notas: `Usuario de ${NOMBRE}`,
  });
}

// Fire-and-forget: nunca bloquea ni tira. Cableado 2026-09-03 (pedido Diego:
// "los usuarios deberían vivir en la lista de contactos propia" — Noelia
// aparecía como número pelado en el WhatsApp de Sofia). Antes
// sincronizarUsuario existía pero NADIE la llamaba.
function sincronizarUsuarioBg(u, motivo = '') {
  if (!u || !u.id || !u.nombre) return;
  sincronizarUsuario(u)
    .then(r => console.log(`[gcontacts] usuario "${u.nombre}" ${r.creado ? 'creado' : 'actualizado'} en Google Contacts${motivo ? ` (${motivo})` : ''}`))
    .catch(err => console.warn(`[gcontacts] sync de usuario "${u.nombre}" falló: ${err.message}`));
}

// Al arrancar: todos los usuarios activos, uno por vez (People API tiene
// cuota por minuto; con <20 usuarios es un segundo).
async function sincronizarUsuariosActivos() {
  const usuarios = require('./usuarios');
  let ok = 0, fail = 0;
  for (const u of usuarios.listarActivos()) {
    try { await sincronizarUsuario(u); ok++; }
    catch (err) { fail++; console.warn(`[gcontacts] arranque: usuario "${u.nombre}" falló: ${err.message}`); }
  }
  console.log(`[gcontacts] arranque: ${ok} usuarios sincronizados a Google Contacts${fail ? `, ${fail} fallaron` : ''}`);
  return { ok, fail };
}

module.exports = { sincronizarContacto, sincronizarUsuario, sincronizarUsuarioBg, sincronizarUsuariosActivos };
