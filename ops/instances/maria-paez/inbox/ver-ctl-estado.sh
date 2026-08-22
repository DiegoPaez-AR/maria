#!/bin/bash
cat > /tmp/vce.cjs <<'JS'
const db=require("/root/secretaria/node_modules/better-sqlite3")(process.env.MARIA_DB,{readonly:true});
db.prepare("SELECT id,cmd,estado,substr(resultado,1,300) r FROM mb_control ORDER BY id DESC LIMIT 6").all()
  .forEach(x=>console.log("#"+x.id,x.cmd,"["+x.estado+"] →",(x.r||"(sin resultado)").slice(0,220)));
db.close();
JS
node /tmp/vce.cjs; rm -f /tmp/vce.cjs
echo "── últimos ctl en log ──"; grep -E "\[ctl\]" ~/.pm2/logs/maria-paez-out.log | tail -5
echo LISTO
