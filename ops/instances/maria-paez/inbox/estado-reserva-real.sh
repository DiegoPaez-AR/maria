#!/bin/bash
cat > /tmp/err.cjs <<'JS'
const db=require("/root/secretaria/node_modules/better-sqlite3")(process.env.MARIA_DB,{readonly:true});
console.log("── ¿salió la reserva REAL a Catalino? ──");
db.prepare(`SELECT id,creado,estado,substr(texto,1,110) t FROM wa_outbox WHERE numero LIKE '%63846461%' ORDER BY id`).all()
  .forEach(x=>console.log("  #"+x.id,x.creado.slice(5,16),"["+x.estado+"]",String(x.t).replace(/\n/g," ")));
console.log("── pendientes de la cena ──");
db.prepare(`SELECT id,estado,substr("desc",1,80) d FROM pendientes WHERE ("desc" LIKE '%atalino%' OR "desc" LIKE '%cena%') AND estado='abierto' ORDER BY id DESC LIMIT 5`).all()
  .forEach(x=>console.log("  #"+x.id,x.estado,String(x.d).replace(/\n/g," ")));
db.close();
JS
node /tmp/err.cjs; rm -f /tmp/err.cjs
echo LISTO
