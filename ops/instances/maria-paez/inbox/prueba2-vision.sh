#!/bin/bash
cat > /tmp/p2.cjs <<'JS'
const db=require("/root/secretaria/node_modules/better-sqlite3")(process.env.MARIA_DB,{readonly:true});
console.log("── WA últimos 10 min ──");
db.prepare(`SELECT timestamp,direccion,substr(cuerpo,1,110) c FROM eventos WHERE canal='whatsapp' AND timestamp>=datetime('now','-10 minutes') ORDER BY id`).all()
  .forEach(x=>console.log(" ",x.timestamp.slice(11,19),x.direccion==='entrante'?'←':'→',String(x.c).replace(/\n/g," ")));
db.close();
JS
node /tmp/p2.cjs; rm -f /tmp/p2.cjs
echo "── MB-MEDIA + logs ──"
grep "MB-MEDIA" ~/.pm2/logs/maria-paez-out.log | tail -3
grep "\[MB " ~/.pm2/logs/maria-paez-out.log | tail -6
echo LISTO
