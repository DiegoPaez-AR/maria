#!/bin/bash
cat > /tmp/cf.cjs <<'JS'
const db=require("/root/secretaria/node_modules/better-sqlite3")(process.env.MARIA_DB,{readonly:true});
console.log("── conversación completa 22/04 00:30-01:00 ──");
db.prepare(`SELECT timestamp,direccion,de,cuerpo FROM eventos WHERE timestamp BETWEEN '2026-04-22 00:25' AND '2026-04-22 01:05' AND canal='whatsapp' ORDER BY id`).all()
  .forEach(x=>console.log("\n["+x.timestamp.slice(11,16)+"] "+(x.direccion==='entrante'?'DIEGO →':'MARIA →')+"\n"+String(x.cuerpo).slice(0,600)));
db.close();
JS
node /tmp/cf.cjs; rm -f /tmp/cf.cjs
echo "── acciones de hechos disponibles ──"
grep -oE "name: '(recordar_hecho|olvidar_hecho|borrar_hecho)'" /root/secretaria/action-schemas.js
echo LISTO
