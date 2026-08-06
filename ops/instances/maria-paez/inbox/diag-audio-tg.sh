#!/bin/bash
node -e "
const db = require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB, {readonly:true});
const rows = db.prepare(\"SELECT timestamp, canal, direccion, substr(cuerpo,1,70) c, tipo_original FROM eventos WHERE usuario_id=1 AND canal IN ('whatsapp','telegram') AND timestamp >= datetime('now','-3 hours') ORDER BY id DESC LIMIT 12\").all();
rows.reverse().forEach(r => console.log(r.timestamp, '|', r.canal, r.direccion, '|', (r.tipo_original||''), '|', r.c.replace(/\n/g,' ')));
db.close();
"
echo LISTO
