#!/bin/bash
L=/var/log/nginx/intensa.io.access.log
echo "── últimos confirmar/ (MariaBridge confirmando envíos) ──"
grep -E "wa-maria.*confirmar" "$L" 2>/dev/null | tail -6 | sed -E 's/.*\[([^]]+)\] "GET ([^"]{0,60}).*" ([0-9]+).*/\1 | \2 → \3/'
echo "── estado del último outbox ──"
node -e "
const db=require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB,{readonly:true});
db.prepare('SELECT id,creado,estado,intentos,numero,substr(texto,1,40) t FROM wa_outbox ORDER BY id DESC LIMIT 3').all().forEach(r=>console.log(r.id,r.creado,r.estado,'int:'+r.intentos,'|',r.numero,'|',r.t));
db.close();
"
echo LISTO
