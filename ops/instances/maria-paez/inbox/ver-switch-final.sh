#!/bin/bash
echo "── logs [MB] últimos 10 min ──"
grep "\[MB " ~/.pm2/logs/maria-paez-out.log | tail -20
echo "── eventos WA de Diego últimos 10 min ──"
node -e "
const db=require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB,{readonly:true});
db.prepare(\"SELECT timestamp,direccion,substr(cuerpo,1,55) c FROM eventos WHERE usuario_id=1 AND canal='whatsapp' AND timestamp>=datetime('now','-10 minutes') ORDER BY id\").all().forEach(r=>console.log(r.timestamp.slice(11),r.direccion,'|',String(r.c).replace(/\n/g,' ')));
db.close();"
echo LISTO
