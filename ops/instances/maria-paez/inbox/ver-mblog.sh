#!/bin/bash
echo "── últimos logs [MB] de MariaBridge (unificados) ──"
grep "\[MB " ~/.pm2/logs/maria-paez-out.log | tail -15
echo "── entrantes de Diego últimos 15 min (¿duplicados?) ──"
node -e "
const db=require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB,{readonly:true});
db.prepare(\"SELECT timestamp,direccion,substr(cuerpo,1,50) c FROM eventos WHERE usuario_id=1 AND canal='whatsapp' AND timestamp>=datetime('now','-15 minutes') ORDER BY id\").all().forEach(r=>console.log(r.timestamp.slice(11),r.direccion,'|',String(r.c).replace(/\n/g,' ')));
db.close();"
echo LISTO
