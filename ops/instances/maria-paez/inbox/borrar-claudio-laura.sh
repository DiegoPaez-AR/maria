#!/bin/bash
cd /root/secretaria
node - <<'NODE'
const db = require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB);
const tx = db.transaction(() => {
  for (const id of [258, 259]) {
    const c = db.prepare(`SELECT id, nombre, usuario_id FROM contactos WHERE id=?`).get(id);
    if (!c) { console.log(`id=${id}: ya no existe`); continue; }
    db.prepare(`DELETE FROM notas_contacto WHERE contacto_id=?`).run(id);
    db.prepare(`DELETE FROM contactos WHERE id=?`).run(id);
    console.log(`borrado id=${id} "${c.nombre}"`);
  }
  db.prepare(`INSERT INTO eventos (usuario_id, canal, direccion, cuerpo, tipo) VALUES (1,'sistema','interno','contactos Claudio Cid y Laura Acera borrados a pedido de Diego (viejos, tel …4111 compartido/erróneo)','dedupe_contactos')`).run();
});
tx();
const check = db.prepare(`SELECT COUNT(*) c FROM contactos WHERE id IN (258,259)`).get().c;
console.log(`verificación: quedan ${check} (esperado 0)`);
db.close();
NODE
echo LISTO
