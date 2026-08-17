#!/bin/bash
echo "── eventos gmail últimos 10 min ──"
node -e "
const db=require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB,{readonly:true});
db.prepare(\"SELECT timestamp,direccion,de,substr(asunto,1,40) a,substr(cuerpo,1,70) c FROM eventos WHERE canal='gmail' AND timestamp>=datetime('now','-15 minutes') ORDER BY id\").all().forEach(r=>console.log(r.timestamp.slice(11),r.direccion,'de:'+String(r.de).slice(0,30),'|',r.a,'|',String(r.c).replace(/\n/g,' ')));
db.close();"
echo "── log pm2 gmail últimos min ──"
grep -i "GMAIL" ~/.pm2/logs/maria-paez-out.log | tail -8
echo LISTO
