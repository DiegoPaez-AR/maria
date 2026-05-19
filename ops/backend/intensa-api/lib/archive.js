// archive.js — al borrar un cliente cancelled, dumpear todos sus datos al archive.

const db = require('./db');
const Database = require('better-sqlite3');
const path = require('path');

function _abrirInstanciaDb(slug) {
  // Convención: /root/secretaria/state/<slug>/db/maria.sqlite
  const dbPath = `/root/secretaria/state/${slug}/db/maria.sqlite`;
  return new Database(dbPath, { readonly: false });
}

/**
 * Dump completo del cliente: eventos, contactos, hechos, pendientes, programados, notas.
 * NO toca la fila del cliente en `clientes` ni del usuario en `usuarios` — eso lo hace
 * el caller después de archivar exitoso.
 */
function archivarCliente(cliente) {
  if (!cliente || !cliente.instancia_slug || !cliente.instancia_usuario_id) {
    throw new Error('archivarCliente: cliente incompleto');
  }
  const idb = _abrirInstanciaDb(cliente.instancia_slug);
  try {
    const uid = cliente.instancia_usuario_id;
    const eventos = idb.prepare(`SELECT * FROM eventos WHERE usuario_id=?`).all(uid);
    const contactos = idb.prepare(`SELECT * FROM contactos WHERE usuario_id=?`).all(uid);
    const hechos = idb.prepare(`SELECT * FROM hechos WHERE usuario_id=?`).all(uid);
    const pendientes = idb.prepare(`SELECT * FROM pendientes WHERE usuario_id=?`).all(uid);
    const programados = idb.prepare(`SELECT * FROM programados WHERE usuario_id=?`).all(uid);
    let notas = [];
    try { notas = idb.prepare(`SELECT * FROM notas_contacto WHERE usuario_id=?`).all(uid); } catch {}

    const a = db.archive();
    a.prepare(`
      INSERT INTO clientes_archivados (
        cliente_id_original, nombre, email, wa, instancia_slug, instancia_usuario_id,
        lemon_customer_id, lemon_subscription_id,
        creado_original, cancelado_en,
        eventos_json, contactos_json, hechos_json, pendientes_json, programados_json, notas_contacto_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      cliente.id, cliente.nombre, cliente.email, cliente.wa, cliente.instancia_slug, uid,
      cliente.lemon_customer_id || null, cliente.lemon_subscription_id || null,
      cliente.creado || null, cliente.cancelado_en || null,
      JSON.stringify(eventos), JSON.stringify(contactos), JSON.stringify(hechos),
      JSON.stringify(pendientes), JSON.stringify(programados), JSON.stringify(notas)
    );
    console.log(`[archive] cliente ${cliente.id} (${cliente.email}) archivado: ${eventos.length} eventos, ${contactos.length} contactos, ${hechos.length} hechos.`);
  } finally {
    idb.close();
  }
}

/**
 * Borra todos los datos del cliente en su instancia + en la tabla clientes.
 * Asume que ya se archivó (caller debe llamar archivarCliente primero).
 */
function borrarCliente(cliente) {
  const idb = _abrirInstanciaDb(cliente.instancia_slug);
  try {
    const uid = cliente.instancia_usuario_id;
    const tx = idb.transaction(() => {
      idb.prepare(`DELETE FROM eventos WHERE usuario_id=?`).run(uid);
      idb.prepare(`DELETE FROM contactos WHERE usuario_id=?`).run(uid);
      idb.prepare(`DELETE FROM hechos WHERE usuario_id=?`).run(uid);
      idb.prepare(`DELETE FROM pendientes WHERE usuario_id=?`).run(uid);
      idb.prepare(`DELETE FROM programados WHERE usuario_id=?`).run(uid);
      try { idb.prepare(`DELETE FROM notas_contacto WHERE usuario_id=?`).run(uid); } catch {}
      try { idb.prepare(`DELETE FROM estado_usuario WHERE usuario_id=?`).run(uid); } catch {}
      idb.prepare(`DELETE FROM usuarios WHERE id=?`).run(uid);
    });
    tx();
  } finally {
    idb.close();
  }
  // Borrar la fila del cliente en control
  db.control().prepare(`DELETE FROM clientes WHERE id=?`).run(cliente.id);
}

module.exports = { archivarCliente, borrarCliente };
