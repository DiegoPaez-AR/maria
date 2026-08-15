#!/bin/bash
cd /root/secretaria
echo "── cola de salientes (wa-outbox) ──"
node -e "
const db = require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB, {readonly:true});
const tablas = db.prepare(\"SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%outbox%' OR name LIKE '%salien%'\").all();
console.log('tablas:', JSON.stringify(tablas));
try {
  const rows = db.prepare(\"SELECT id, creado, estado, numero, substr(texto,1,60) t, intentos FROM wa_outbox ORDER BY id DESC LIMIT 8\").all();
  rows.reverse().forEach(r => console.log(r.id, r.creado, r.estado, 'int:'+(r.intentos??'-'), '|', String(r.numero).slice(-8), '|', String(r.t).replace(/\n/g,' ')));
  const pend = db.prepare(\"SELECT COUNT(*) c, MIN(creado) viejo FROM wa_outbox WHERE estado='pendiente'\").get();
  console.log('PENDIENTES sin confirmar:', pend.c, pend.viejo ? '(el más viejo: '+pend.viejo+')' : '');
} catch(e) { console.log('schema distinto:', e.message); }
db.close();
"
echo "── último latido del teléfono (accesos al hook en nginx) ──"
grep "wa-hook" /var/log/nginx/access.log 2>/dev/null | tail -3 | sed -E 's/^([0-9.]+).*\[([^]]+)\].*"(GET|POST) ([^ ?]+)[^"]*".*/\2 \3 \4/' 
echo LISTO
