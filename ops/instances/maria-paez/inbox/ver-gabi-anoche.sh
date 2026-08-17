#!/bin/bash
node -e "
const db=require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB,{readonly:true});
console.log('── eventos de Gabriela (u18) desde ayer 19:00 ART (22:00 UTC) ──');
db.prepare(\"SELECT timestamp,canal,direccion,substr(cuerpo,1,80) c FROM eventos WHERE usuario_id=18 AND timestamp>='2026-08-16 22:00' ORDER BY id\").all().forEach(r=>console.log(r.timestamp.slice(5,16),r.canal,r.direccion,'|',String(r.c).replace(/\n/g,' ⏎ ')));
console.log('── programados de Gabriela para hoy ──');
db.prepare(\"SELECT id,cuando,enviado,substr(texto,1,60) t FROM programados WHERE usuario_id=18 AND cuando>='2026-08-17' ORDER BY cuando LIMIT 8\").all().forEach(r=>console.log('#'+r.id,r.cuando,'env:'+r.enviado,'|',String(r.t).replace(/\n/g,' ')));
db.close();"
echo "── logs MB de anoche 20:15-20:30 ART con Gabriela ──"
grep "\[MB " ~/.pm2/logs/maria-paez-out.log | grep -i "gabriela" | tail -8
echo LISTO
