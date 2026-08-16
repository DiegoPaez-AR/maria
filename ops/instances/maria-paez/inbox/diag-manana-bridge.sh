#!/bin/bash
echo "── 1. estado del bridge (poller + confirmaciones últimas 3h) ──"
L=/var/log/nginx/intensa.io.access.log
echo "GETs pendiente.txt última hora: $(grep 'pendiente.txt' "$L" | grep "$(date '+%d/%b/%Y:%H')" | wc -l)"
echo "confirmaciones hoy: $(grep -c 'wa-maria.*confirmar' "$L")"
echo "── 2. mbdiag de hoy (mismatches = mensajes que NO pudo mandar) ──"
grep "MB-DIAG" ~/.pm2/logs/maria-paez-out.log | tail -5
echo "── 3. outbox: pendientes atascados ──"
node -e "
const db=require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB,{readonly:true});
console.log('por estado (hoy):');
db.prepare(\"SELECT estado,COUNT(*) c FROM wa_outbox WHERE creado>=datetime('now','-12 hours') GROUP BY estado\").all().forEach(r=>console.log('  '+r.estado+':',r.c));
console.log('atascados (pendiente, muchos intentos):');
db.prepare(\"SELECT id,creado,intentos,numero,substr(texto,1,45) t FROM wa_outbox WHERE estado='pendiente' AND intentos>5 ORDER BY id DESC LIMIT 6\").all().forEach(r=>console.log('  #'+r.id,r.creado,'int:'+r.intentos,'|',r.numero,'|',String(r.t).replace(/\n/g,' ')));
db.close();"
echo "── 4. conversación Telegram de Diego (u1) últimos 12 ──"
node -e "
const db=require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB,{readonly:true});
db.prepare(\"SELECT timestamp,direccion,substr(cuerpo,1,80) c FROM eventos WHERE usuario_id=1 AND canal='telegram' ORDER BY id DESC LIMIT 12\").all().reverse().forEach(r=>console.log(r.timestamp.slice(5,16),r.direccion,'|',String(r.c).replace(/\n/g,' ')));
db.close();"
echo LISTO
