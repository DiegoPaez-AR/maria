#!/bin/bash
node -e "
const db = require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB, {readonly:true});
const u = db.prepare(\"SELECT id, nombre, wa_cus, wa_lid FROM usuarios WHERE nombre LIKE '%Echaniz%'\").get();
console.log('usuario:', JSON.stringify(u));
const rows = db.prepare(\"SELECT id, timestamp, direccion, substr(cuerpo,1,120) c, json_extract(metadata_json,'\$.messageId') mid FROM eventos WHERE usuario_id=? AND canal='whatsapp' ORDER BY id DESC LIMIT 8\").all(u.id);
rows.reverse().forEach(r => console.log(r.id, r.timestamp, r.direccion, '|', String(r.c).replace(/\n/g,' '), '| mid:', String(r.mid||'').slice(0,30)));
// errores recientes asociados
const errs = db.prepare(\"SELECT timestamp, substr(cuerpo,1,120) c FROM eventos WHERE canal='sistema' AND (cuerpo LIKE '%Echaniz%' OR cuerpo LIKE '%falló%') AND timestamp >= datetime('now','-1 day') ORDER BY id DESC LIMIT 5\").all();
console.log('--- sistema:'); errs.forEach(r => console.log(r.timestamp, '|', String(r.c).replace(/\n/g,' ')));
db.close();
"
echo LISTO
