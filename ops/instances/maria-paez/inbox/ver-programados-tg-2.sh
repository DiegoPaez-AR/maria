#!/bin/bash
node -e "
const db=require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB,{readonly:true});
const cols=db.prepare('PRAGMA table_info(programados)').all().map(c=>c.name).join(',');
console.log('cols:',cols);
const rows=db.prepare(\"SELECT * FROM programados WHERE texto LIKE '%Telegram%' ORDER BY cuando LIMIT 20\").all();
rows.forEach(r=>console.log('#'+r.id, r.cuando, (r.destino||'').slice(0,22), (r.enviado!==undefined?('enviado='+r.enviado):'')));
console.log('total campaña:',rows.length);
db.close();"
echo LISTO
