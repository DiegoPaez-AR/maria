#!/bin/bash
echo "── wa-hook en logs 21:27-21:30 ──"
grep -E "21:2[7-9]|21:3[0-1]" /root/.pm2/logs/maria-paez-out.log | grep -iE "wa-hook|fulco|deadline|stash|wa-send" | head -8
echo "── ¿salió email? ──"
node -e "
const db = require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB, {readonly:true});
const rows = db.prepare(\"SELECT id, timestamp, canal, direccion, usuario_id, substr(cuerpo,1,120) c, json_extract(metadata_json,'\$.tag') tag FROM eventos WHERE direccion='saliente' AND timestamp >= datetime('now','-25 minutes') ORDER BY id\").all();
rows.forEach(r => console.log(r.id, r.timestamp, r.canal, 'u'+r.usuario_id, '|', String(r.tag||''), '|', String(r.c).replace(/\n/g,' ')));
db.close();
"
echo LISTO
