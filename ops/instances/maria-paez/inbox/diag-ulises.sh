#!/bin/bash
node -e "
const db = require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB, {readonly:true});
const rows = db.prepare(\"SELECT id, usuario_id, nombre, whatsapp, email, visibilidad FROM contactos WHERE nombre LIKE '%Ulises%' OR nombre LIKE '%Esteban%'\").all();
console.log(rows.length ? JSON.stringify(rows, null, 1) : 'NO existen Ulises ni Esteban en ninguna libreta');
db.close();
"
echo LISTO
