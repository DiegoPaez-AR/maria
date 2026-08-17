#!/bin/bash
node -e "
const db=require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB);
const rows=db.prepare(\"SELECT id FROM programados WHERE texto LIKE '%Telegram%' AND enviado=0 ORDER BY cuando\").all();
const t0=new Date('2026-08-17T10:00:00-03:00').getTime();
rows.forEach((r,i)=>{
  const cuando=new Date(t0 + i*45*60*1000).toISOString();
  db.prepare('UPDATE programados SET cuando=? WHERE id=?').run(cuando, r.id);
  console.log('#'+r.id,'→',cuando);
});
console.log('reprogramados:',rows.length,'(cada 45min desde 10:00 ART)');
db.close();"
echo LISTO
