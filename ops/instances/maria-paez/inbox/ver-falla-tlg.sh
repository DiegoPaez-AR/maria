#!/bin/bash
echo "── salientes TG a Diego (últimos 30 min) ──"
node -e "
const db=require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB,{readonly:true});
db.prepare(\"SELECT timestamp,substr(cuerpo,1,200) c FROM eventos WHERE usuario_id=1 AND canal='telegram' AND direccion='saliente' AND timestamp>=datetime('now','-30 minutes') ORDER BY id\").all().forEach(r=>console.log(r.timestamp.slice(11),'|',String(r.c).replace(/\n/g,' ⏎ ')));
db.close();"
echo "── errores en pm2 log últimos 15 min ──"
grep -iE "error|falló|FALLO|warn" ~/.pm2/logs/maria-paez-out.log | tail -12
echo "── logs MB últimos 10 ──"
grep "\[MB " ~/.pm2/logs/maria-paez-out.log | tail -10
echo LISTO
