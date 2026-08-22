#!/bin/bash
cat > /tmp/vn3.cjs <<'JS'
const db=require("/root/secretaria/node_modules/better-sqlite3")(process.env.MARIA_DB,{readonly:true});
db.prepare("SELECT id,cmd,estado,substr(resultado,1,420) r FROM mb_control ORDER BY id DESC LIMIT 3").all()
  .forEach(x=>console.log("#"+x.id,x.cmd,"["+x.estado+"] →",x.r||"(sin resultado)"));
db.close();
JS
node /tmp/vn3.cjs; rm -f /tmp/vn3.cjs
echo "── logs ctl ──"; grep -E "\[ctl\]|MB-CTL" ~/.pm2/logs/maria-paez-out.log | tail -6
echo "── versión de la app ──"; grep "\[MB v" ~/.pm2/logs/maria-paez-out.log | tail -2
echo LISTO
