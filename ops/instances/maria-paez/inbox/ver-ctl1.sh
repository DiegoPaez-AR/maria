#!/bin/bash
cat > /tmp/vc.cjs <<'JS'
const db=require("/root/secretaria/node_modules/better-sqlite3")(process.env.MARIA_DB,{readonly:true});
db.prepare("SELECT id,cmd,estado,substr(resultado,1,400) r,creado,resuelto FROM mb_control ORDER BY id DESC LIMIT 3").all()
  .forEach(x=>console.log("#"+x.id,x.cmd,"["+x.estado+"]",x.resuelto?("resuelto "+x.resuelto.slice(11,19)):"", "\n   →",x.r||"(sin resultado)"));
db.close();
JS
node /tmp/vc.cjs; rm -f /tmp/vc.cjs
echo "── logs [ctl] ──"
grep -E "\[MB .*ctl\]|MB-CTL" ~/.pm2/logs/maria-paez-out.log | tail -5
echo LISTO
