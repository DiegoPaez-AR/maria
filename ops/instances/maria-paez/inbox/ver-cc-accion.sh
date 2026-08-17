#!/bin/bash
node -e "
const db=require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB,{readonly:true});
console.log('── acciones/eventos últimos 8 min ──');
db.prepare(\"SELECT timestamp,canal,direccion,de,substr(cuerpo,1,90) c FROM eventos WHERE timestamp>=datetime('now','-8 minutes') AND (canal IN ('gmail','whatsapp','sistema')) ORDER BY id\").all().forEach(r=>console.log(r.timestamp.slice(11),r.canal,r.direccion,'|',String(r.c).replace(/\n/g,' ')));
console.log('── pendientes nuevos ──');
db.prepare(\"SELECT id,substr(\\\"desc\\\",1,80) d,estado FROM pendientes WHERE creado>=datetime('now','-8 minutes')\").all().forEach(r=>console.log('#'+r.id,r.estado,'|',r.d));
db.close();"
echo LISTO
