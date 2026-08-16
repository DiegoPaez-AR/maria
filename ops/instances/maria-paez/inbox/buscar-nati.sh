#!/bin/bash
echo "── 1. ¿el mensaje del cine (#42) salió alguna vez? ──"
node -e "
const db=require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB,{readonly:true});
db.prepare(\"SELECT id,creado,estado,intentos,numero,substr(texto,1,50) t FROM wa_outbox WHERE numero LIKE '%50105262%' ORDER BY id\").all().forEach(r=>console.log('#'+r.id,r.creado,r.estado,'int:'+r.intentos,'|',String(r.t).replace(/\n/g,' ')));
db.close();"
echo "── 2. eventos con Nati (todos los canales, hoy) ──"
node -e "
const db=require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB,{readonly:true});
db.prepare(\"SELECT timestamp,canal,direccion,de,substr(cuerpo,1,70) c FROM eventos WHERE (de LIKE '%50105262%' OR cuerpo LIKE '%atali%' OR de LIKE '%atali%') AND timestamp>=datetime('now','-24 hours') ORDER BY id\").all().forEach(r=>console.log(r.timestamp.slice(5,16),r.canal,r.direccion,'de:'+String(r.de).slice(0,25),'|',String(r.c).replace(/\n/g,' ')));
db.close();"
echo "── 3. logs [MB] con Natali ──"
grep "\[MB " ~/.pm2/logs/maria-paez-out.log | grep -i "natali\|nati" | tail -6
echo "── 4. descartes del hook (desconocidos/ambiguos hoy) ──"
node -e "
const db=require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB,{readonly:true});
db.prepare(\"SELECT timestamp,substr(cuerpo,1,90) c FROM eventos WHERE canal='sistema' AND (cuerpo LIKE 'wa-hook:%') AND timestamp>=datetime('now','-6 hours') ORDER BY id DESC LIMIT 8\").all().forEach(r=>console.log(r.timestamp.slice(11),'|',String(r.c).replace(/\n/g,' ')));
db.close();"
echo LISTO
