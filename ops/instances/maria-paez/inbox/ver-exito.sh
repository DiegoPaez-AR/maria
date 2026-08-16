#!/bin/bash
L=/var/log/nginx/intensa.io.access.log
echo "── confirmaciones de MariaBridge (envíos concretados) ──"
grep -E "wa-maria.*confirmar" "$L" 2>/dev/null | tail -4 | sed -E 's/.*\[([^]]+)\].*"GET ([^"]{0,55}).*/\1 | \2/'
echo "── último outbox (debe estar 'entregado') ──"
node -e "
const db=require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB,{readonly:true});
db.prepare('SELECT id,creado,estado,intentos,substr(texto,1,45) t FROM wa_outbox ORDER BY id DESC LIMIT 3').all().forEach(r=>console.log(r.id,r.creado,r.estado,'int:'+r.intentos,'|',String(r.t).replace(/\n/g,' ')));
db.close();"
echo "── conversación de Diego con Maria (últimos 6) ──"
node -e "
const db=require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB,{readonly:true});
db.prepare(\"SELECT timestamp,direccion,substr(cuerpo,1,60) c FROM eventos WHERE usuario_id=1 AND canal='whatsapp' ORDER BY id DESC LIMIT 6\").all().reverse().forEach(r=>console.log(r.timestamp.slice(11),r.direccion,'|',String(r.c).replace(/\n/g,' ')));
db.close();"
echo LISTO
