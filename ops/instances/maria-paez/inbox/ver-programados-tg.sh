#!/bin/bash
node -e "
const db=require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB,{readonly:true});
const rows=db.prepare(\"SELECT id,cuando,substr(destino,1,20) d,substr(texto,1,40) t FROM programados WHERE estado='pendiente' AND texto LIKE '%Telegram%' ORDER BY cuando LIMIT 20\").all();
rows.forEach(r=>console.log('#'+r.id,r.cuando,r.d,'|',r.t));
console.log('total programados campaña:',rows.length);
db.close();"
echo LISTO
