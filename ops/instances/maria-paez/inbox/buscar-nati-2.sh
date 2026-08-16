#!/bin/bash
echo "── logs [MB] con Natali/Nati ──"
grep "\[MB " ~/.pm2/logs/maria-paez-out.log | grep -i "natali\|nati" | tail -8
echo "── hook: desconocidos/ambiguos (6h) ──"
node -e "
const db=require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB,{readonly:true});
db.prepare(\"SELECT timestamp,substr(cuerpo,1,100) c FROM eventos WHERE canal='sistema' AND cuerpo LIKE 'wa-hook:%' AND timestamp>=datetime('now','-6 hours') ORDER BY id DESC LIMIT 10\").all().forEach(r=>console.log(r.timestamp.slice(11),'|',String(r.c).replace(/\n/g,' ')));
db.close();"
echo "── ¿qué generó el #44? turnos de Maria 13:40-14:00 UTC ──"
node -e "
const db=require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB,{readonly:true});
db.prepare(\"SELECT timestamp,canal,direccion,de,substr(cuerpo,1,60) c FROM eventos WHERE timestamp BETWEEN '2026-08-16 13:45' AND '2026-08-16 14:00' ORDER BY id LIMIT 12\").all().forEach(r=>console.log(r.timestamp.slice(11),r.canal,r.direccion,'|',String(r.c).replace(/\n/g,' ')));
db.close();"
echo LISTO
