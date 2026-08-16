#!/bin/bash
node -e "
const db=require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB);
const lids=db.prepare(\"SELECT id,nombre,wa_cus,wa_lid FROM usuarios WHERE wa_cus LIKE '%@lid%'\").all();
console.log('usuarios con wa_cus @lid:', lids.length);
for (const u of lids) {
  const c=db.prepare(\"SELECT whatsapp FROM contactos WHERE lower(trim(nombre))=lower(trim(?)) AND whatsapp LIKE '%@c.us%' LIMIT 1\").get(u.nombre);
  console.log('-', u.id, u.nombre, '| wa_cus:', String(u.wa_cus).slice(0,24), '| wa_lid:', String(u.wa_lid||'').slice(0,24), '| libreta:', c?c.whatsapp:'NO');
}
db.close();"
echo LISTO
