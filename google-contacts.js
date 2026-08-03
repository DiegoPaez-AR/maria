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

const CAMPOS = 'names,phoneNumbers,emailAddresses,biographies';

function _cuerpo(c, dueno) {
  const notas = [];
  if (c.notas) notas.push(String(c.notas));
  if (c.perfil_web) notas.push('— Perfil: ' + String(c.perfil_web).slice(0, 600));
  if (c.cumple) notas.push('Cumple: ' + c.cumple);
  if (dueno) notas.push(`(libreta de ${dueno})`);
  const digs = String(c.whatsapp || '').replace(/\D/g, '');
  return {
    names: [{ givenName: String(c.nombre) }],
    ...(digs ? { phoneNumbers: [{ value: '+' + digs }] } : {}),
    ...(c.email ? { emailAddresses: [{ value: c.email }] } : {}),
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

module.exports = { sincronizarContacto, sincronizarUsuario };
