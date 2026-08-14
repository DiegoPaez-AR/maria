#!/bin/bash
node -e "
const db = require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB, {readonly:true});
const rows = db.prepare(\"SELECT id, timestamp, canal, direccion, substr(cuerpo,1,130) c FROM eventos WHERE usuario_id=2 AND timestamp >= datetime('now','-12 minutes') ORDER BY id\").all();
rows.forEach(r => console.log(r.id, r.timestamp, r.canal, r.direccion, '|', String(r.c).replace(/\n/g,' ')));
db.close();
"
echo LISTO
