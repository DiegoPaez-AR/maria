#!/bin/bash
cat > /tmp/i43b.cjs <<'JS'
const db=require("/root/secretaria/node_modules/better-sqlite3")(process.env.MARIA_DB,{readonly:true});
console.log("── comandos ──");
db.prepare("SELECT id,cmd,estado,substr(resultado,1,300) r FROM mb_control ORDER BY id DESC LIMIT 4").all()
  .reverse().forEach(x=>console.log("#"+x.id,x.cmd,"["+x.estado+"]",(x.r||"").slice(0,280)));
db.close();
JS
node /tmp/i43b.cjs; rm -f /tmp/i43b.cjs
# si la app está abierta, tocar "Buscar actualización" (360,883)
cat > /tmp/i43c.cjs <<'JS'
const c=require("/root/secretaria/mb-control.js");
console.log("tap Buscar actualización:", c.encolar("tap",{x:360,y:883}));
JS
node /tmp/i43c.cjs; rm -f /tmp/i43c.cjs
echo LISTO
