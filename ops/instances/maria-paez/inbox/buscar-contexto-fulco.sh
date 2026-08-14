#!/bin/bash
node -e "
const db = require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB, {readonly:true});
console.log('── menciones de 21/8 o viernes (todo canal, 21 días) ──');
const rows = db.prepare(\"SELECT id, timestamp, usuario_id, canal, direccion, substr(cuerpo,1,130) c FROM eventos WHERE (cuerpo LIKE '%21/8%' OR cuerpo LIKE '%21 de agosto%' OR (cuerpo LIKE '%viernes%' AND cuerpo LIKE '%9%')) AND timestamp >= datetime('now','-21 days') AND canal != 'sistema' ORDER BY id DESC LIMIT 10\").all();
rows.reverse().forEach(r => console.log(r.id, r.timestamp, 'u'+r.usuario_id, r.canal, r.direccion, '|', String(r.c).replace(/\n/g,' ')));
console.log('── pendientes/follow-ups abiertos de Fulco (u2) ──');
const p = db.prepare(\"SELECT id, dueno, disparador, substr(COALESCE(\\\"desc\\\",descripcion,''),1,100) d FROM pendientes WHERE usuario_id=2 AND estado NOT IN ('cerrado','cancelado') LIMIT 6\").all().map(x=>x);
console.log(JSON.stringify(p, null, 1));
db.close();
" 2>&1 | head -25
echo LISTO
