#!/bin/bash
node -e "
const db = require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB, {readonly:true});
const u = db.prepare(\"SELECT id, nombre, wa_cus FROM usuarios WHERE nombre LIKE '%Fulco%'\").get();
console.log('usuario:', JSON.stringify(u));
const rows = db.prepare(\"SELECT id, timestamp, direccion, substr(cuerpo,1,130) c FROM eventos WHERE usuario_id=? AND canal='whatsapp' ORDER BY id DESC LIMIT 6\").all(u.id);
rows.reverse().forEach(r => console.log(r.id, r.timestamp, r.direccion, '|', String(r.c).replace(/\n/g,' ')));
db.close();
"
echo LISTO
