#!/bin/bash
cat > /tmp/vm.cjs <<'JS'
const db=require("/root/secretaria/node_modules/better-sqlite3")(process.env.MARIA_DB,{readonly:true});
db.prepare("SELECT id,cmd,estado,substr(resultado,1,300) r FROM mb_control ORDER BY id DESC LIMIT 5").all()
  .reverse().forEach(x=>console.log("#"+x.id,x.cmd,"["+x.estado+"] →",(x.r||"(sin resultado)").slice(0,260)));
db.close();
JS
node /tmp/vm.cjs; rm -f /tmp/vm.cjs
echo "── logs ctl ──"; grep "\[ctl\]" ~/.pm2/logs/maria-paez-out.log | tail -5
echo LISTO
