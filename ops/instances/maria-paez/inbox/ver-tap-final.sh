#!/bin/bash
cat > /tmp/vtf.cjs <<'JS'
const db=require("/root/secretaria/node_modules/better-sqlite3")(process.env.MARIA_DB,{readonly:true});
db.prepare("SELECT id,cmd,estado,substr(resultado,1,320) r FROM mb_control WHERE id>=7 ORDER BY id").all()
  .forEach(x=>console.log("#"+x.id,x.cmd,"["+x.estado+"] →",(x.r||"(sin resultado)").slice(0,300)));
db.close();
JS
node /tmp/vtf.cjs; rm -f /tmp/vtf.cjs
echo "── logs ctl ──"; grep "\[ctl\]" ~/.pm2/logs/maria-paez-out.log | tail -6
echo LISTO
