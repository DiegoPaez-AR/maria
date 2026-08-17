#!/bin/bash
node -e "
const db=require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB,{readonly:true});
console.log('── programados de Gabriela hoy ──');
db.prepare(\"SELECT id,cuando,enviado,substr(texto,1,50) t FROM programados WHERE usuario_id=18 AND cuando LIKE '2026-08-17%' ORDER BY cuando\").all().forEach(r=>console.log('#'+r.id,r.cuando,r.enviado?'ENVIADO ✓':'pendiente','|',String(r.t).replace(/\n/g,' ')));
console.log('── outbox reciente ──');
db.prepare(\"SELECT id,creado,estado,intentos,numero,substr(texto,1,40) t FROM wa_outbox WHERE creado>='2026-08-17 11:30' ORDER BY id\").all().forEach(r=>console.log('#'+r.id,r.creado.slice(11),r.estado,'int:'+r.intentos,r.numero.slice(-6),'|',String(r.t).replace(/\n/g,' ')));
db.close();"
echo "── logs MB última hora ──"
grep "\[MB " ~/.pm2/logs/maria-paez-out.log | tail -6
echo LISTO
