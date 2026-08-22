#!/bin/bash
cat > /tmp/vf.cjs <<'JS'
const db=require("/root/secretaria/node_modules/better-sqlite3")(process.env.MARIA_DB,{readonly:true});
console.log("── eventos del 21/04 sobre la foto ──");
db.prepare(`SELECT timestamp,canal,direccion,de,substr(cuerpo,1,90) c,metadata_json m FROM eventos WHERE timestamp LIKE '2026-04-21%' AND (cuerpo LIKE '%foto%' OR cuerpo LIKE '%imagen%' OR cuerpo LIKE '%perfil%') ORDER BY id LIMIT 12`).all()
  .forEach(x=>{let via='';try{via=JSON.parse(x.m||'{}').via||''}catch{};console.log(" ",x.timestamp.slice(5,16),x.canal,x.direccion,via,"|",String(x.c).replace(/\n/g," "))});
console.log("── ¿hay hechos sobre la foto/perfil? ──");
db.prepare(`SELECT clave,substr(valor,1,80) v FROM hechos WHERE valor LIKE '%foto%' OR clave LIKE '%foto%' LIMIT 5`).all()
  .forEach(x=>console.log("  ",x.clave,"|",x.v));
db.close();
JS
node /tmp/vf.cjs; rm -f /tmp/vf.cjs
echo LISTO
