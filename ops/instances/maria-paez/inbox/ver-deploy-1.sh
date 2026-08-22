#!/bin/bash
cat > /tmp/vd1.cjs <<'JS'
const db=require("/root/secretaria/node_modules/better-sqlite3")(process.env.MARIA_DB,{readonly:true});
db.prepare("SELECT id,cmd,estado,substr(resultado,1,420) r FROM mb_control ORDER BY id DESC LIMIT 3").all()
  .reverse().forEach(x=>console.log("#"+x.id,x.cmd,"["+x.estado+"] →",(x.r||"(sin resultado)").slice(0,400)));
db.close();
JS
node /tmp/vd1.cjs; rm -f /tmp/vd1.cjs
echo LISTO
