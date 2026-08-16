#!/bin/bash
echo "── hilo completo con Nati (WA, hoy) ──"
node -e "
const db=require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB,{readonly:true});
db.prepare(\"SELECT timestamp,direccion,de,substr(cuerpo,1,90) c FROM eventos WHERE canal='whatsapp' AND (de LIKE '%50105262%' OR de LIKE '%atali%' OR (direccion='saliente' AND cuerpo LIKE '%Nati%')) AND timestamp>=datetime('now','-8 hours') ORDER BY id\").all().forEach(r=>console.log(r.timestamp.slice(11),r.direccion,'de:'+String(r.de).slice(0,28),'|',String(r.c).replace(/\n/g,' ')));
db.close();"
echo "── pendientes tocados 13:56 (agregar/quitar) ──"
node -e "
const db=require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB,{readonly:true});
db.prepare(\"SELECT timestamp,substr(cuerpo,1,120) c FROM eventos WHERE canal='sistema' AND timestamp BETWEEN '2026-08-16 13:56' AND '2026-08-16 13:58' ORDER BY id\").all().forEach(r=>console.log(r.timestamp.slice(11),'|',String(r.c).replace(/\n/g,' ')));
db.prepare(\"SELECT id,dueno,estado,substr(descripcion,1,70) d,esperando_de FROM pendientes WHERE descripcion LIKE '%ine%' OR descripcion LIKE '%ati%' ORDER BY id DESC LIMIT 5\").all().forEach(r=>console.log('pend #'+r.id,r.dueno,r.estado,'|',r.d,'| esperando:',r.esperando_de));
db.close();"
echo LISTO
