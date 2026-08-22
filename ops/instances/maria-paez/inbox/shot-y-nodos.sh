#!/bin/bash
cat > /tmp/sn.cjs <<'JS'
const db=require("/root/secretaria/node_modules/better-sqlite3")(process.env.MARIA_DB,{readonly:true});
console.log("── resultado del tap #2 ──");
db.prepare("SELECT id,cmd,estado,substr(resultado,1,120) r FROM mb_control WHERE id=2").all().forEach(x=>console.log("  #"+x.id,x.cmd,x.estado,"→",x.r));
db.close();
const c=require("/root/secretaria/mb-control.js");
console.log("nodos (para ver la pantalla de MariaBridge):", c.encolar("nodos"));
JS
node /tmp/sn.cjs; rm -f /tmp/sn.cjs
echo LISTO
