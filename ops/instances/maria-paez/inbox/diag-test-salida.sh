#!/bin/bash
node <<'NODE'
const db = require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB, { readonly: true });
console.log('── wa de Diego (usuarios id=1) ──');
const d = db.prepare(`SELECT id, nombre, wa_cus, wa_lid FROM usuarios WHERE id=1`).get();
console.log(JSON.stringify(d));
console.log('── últimas filas del outbox ──');
const rows = db.prepare(`SELECT id, creado, estado, numero, intentos, substr(texto,1,60) t FROM wa_outbox ORDER BY id DESC LIMIT 5`).all();
rows.reverse().forEach(r => console.log(r.id, r.creado, r.estado, 'int:'+r.intentos, '|', r.numero, '|', String(r.t).replace(/\n/g,' ')));
db.close();
NODE
echo LISTO
