#!/bin/bash
cd /root/secretaria
timeout 30 node -e "
const mem=require('/root/secretaria/memory');
const tel=require('/root/secretaria/telefonos');
const c=mem.db.prepare(\"SELECT * FROM contactos WHERE usuario_id=1 AND lower(email)='pluna@partnerexpansion.com'\").get();
console.log('antes:', {id:c.id, nombre:c.nombre, whatsapp:c.whatsapp, email:c.email});
const wa=tel.wid('+54 11 5418-9426');
mem.db.prepare(\"UPDATE contactos SET nombre='Pablo Luna', whatsapp=COALESCE(whatsapp, ?) WHERE id=?\").run(wa, c.id);
const d=mem.db.prepare('SELECT id,nombre,whatsapp,email FROM contactos WHERE id=?').get(c.id);
console.log('después:', d);
mem.log({usuarioId:1,canal:'sistema',direccion:'interno',
  cuerpo:'Ficha unificada: \"Pluna\" → \"Pablo Luna\" (mismo email pluna@partnerexpansion.com) + teléfono de la vCard. El upsert de las 18:43 había fallado por el candado anti-duplicados, correctamente.',
  metadata:{tipo:'merge_contacto'}});
"
echo LISTO
