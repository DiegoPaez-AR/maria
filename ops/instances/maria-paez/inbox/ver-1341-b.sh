#!/bin/bash
node -e "
const db=require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB,{readonly:true});
console.log('#1341:', JSON.stringify(db.prepare('SELECT id,enviado,razon FROM programados WHERE id=1341').get()));
db.prepare(\"SELECT id,estado,intentos,numero,substr(texto,1,35) t FROM wa_outbox WHERE id>51 ORDER BY id\").all().forEach(x=>console.log('#'+x.id,x.estado,'int:'+x.intentos,x.numero.slice(-6),'|',x.t));
db.close();"
grep "programados/1341\|programados\]" ~/.pm2/logs/maria-paez-out.log | tail -4
echo LISTO
