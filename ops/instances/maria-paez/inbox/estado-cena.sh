#!/bin/bash
node -e "
const db=require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB,{readonly:true});
console.log('── outbox: mensajes de la cena ──');
db.prepare(\"SELECT id,creado,estado,intentos,numero,substr(texto,1,50) t FROM wa_outbox WHERE id>=45 ORDER BY id\").all().forEach(r=>console.log('#'+r.id,r.estado,'int:'+r.intentos,r.numero,'|',String(r.t).replace(/\n/g,' ')));
console.log('── contacto Carolina (¿tiene email?) ──');
db.prepare(\"SELECT nombre,whatsapp,email FROM contactos WHERE nombre LIKE '%runatti%'\").all().forEach(r=>console.log(r.nombre,'|',r.whatsapp,'|',r.email));
console.log('── ¿respondió Gabriel? ──');
db.prepare(\"SELECT timestamp,direccion,substr(cuerpo,1,60) c FROM eventos WHERE canal='whatsapp' AND de LIKE '%40402319%' ORDER BY id DESC LIMIT 3\").all().forEach(r=>console.log(r.timestamp.slice(11),r.direccion,'|',String(r.c).replace(/\n/g,' ')));
db.close();"
echo LISTO
