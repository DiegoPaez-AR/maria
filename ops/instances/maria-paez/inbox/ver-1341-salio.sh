#!/bin/bash
node -e "
const db=require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB,{readonly:true});
const r=db.prepare('SELECT id,enviado,razon FROM programados WHERE id=1341').get();
console.log('#1341:', JSON.stringify(r));
db.prepare(\"SELECT id,estado,intentos,numero,substr(texto,1,30) t FROM wa_outbox ORDER BY id DESC LIMIT 3\").all().forEach(x=>console.log('#'+x.id,x.estado,'int:'+x.intentos,x.numero.slice(-6),'|',x.t));
db.close();"
grep "programados/1341\|MB " ~/.pm2/logs/maria-paez-out.log | tail -5
echo LISTO
