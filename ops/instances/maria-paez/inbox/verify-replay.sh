#!/bin/bash
node -e "
const db = require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB, {readonly:true});
const rows = db.prepare(\"SELECT id, timestamp, canal, direccion, de, substr(cuerpo,1,110) c FROM eventos WHERE timestamp >= datetime('now','-15 minutes') AND (de LIKE '%4193517%' OR de LIKE '%6528655%' OR usuario_id=18) ORDER BY id\").all();
rows.forEach(r => console.log(r.id, r.timestamp, r.canal, r.direccion, '|', String(r.de||'').slice(-16), '|', String(r.c).replace(/\n/g,' ')));
// pendientes de seguimiento creados
const p = db.prepare(\"SELECT id, substr(desc_,1,80) d FROM pendientes WHERE usuario_id=18 AND estado='abierto' ORDER BY id DESC LIMIT 3\").all().catch?.() || [];
db.close();
" 2>/dev/null || node -e "
const db = require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB, {readonly:true});
const rows = db.prepare(\"SELECT id, timestamp, canal, direccion, de, substr(cuerpo,1,110) c FROM eventos WHERE timestamp >= datetime('now','-15 minutes') AND usuario_id=18 ORDER BY id\").all();
rows.forEach(r => console.log(r.id, r.timestamp, r.canal, r.direccion, '|', String(r.de||'').slice(-16), '|', String(r.c).replace(/\n/g,' ')));
db.close();
"
echo LISTO
