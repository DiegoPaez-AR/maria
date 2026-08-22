#!/bin/bash
cat > /tmp/i43d.cjs <<'JS'
const db=require("/root/secretaria/node_modules/better-sqlite3")(process.env.MARIA_DB,{readonly:true});
db.prepare("SELECT id,cmd,estado,substr(resultado,1,400) r FROM mb_control ORDER BY id DESC LIMIT 3").all()
  .reverse().forEach(x=>console.log("#"+x.id,x.cmd,"["+x.estado+"]",(x.r||"").slice(0,380)));
db.close();
JS
node /tmp/i43d.cjs; rm -f /tmp/i43d.cjs
echo "── pido nodos + shot ──"
cat > /tmp/i43e.cjs <<'JS'
const c=require("/root/secretaria/mb-control.js");
console.log("nodos:", c.encolar("nodos"));
JS
node /tmp/i43e.cjs; rm -f /tmp/i43e.cjs
sleep 25
cat > /tmp/i43f.cjs <<'JS'
const db=require("/root/secretaria/node_modules/better-sqlite3")(process.env.MARIA_DB,{readonly:true});
db.prepare("SELECT id,cmd,estado,substr(resultado,1,900) r FROM mb_control ORDER BY id DESC LIMIT 2").all()
  .reverse().forEach(x=>console.log("#"+x.id,x.cmd,"["+x.estado+"]",(x.r||"")));
db.close();
JS
node /tmp/i43f.cjs; rm -f /tmp/i43f.cjs
echo LISTO
