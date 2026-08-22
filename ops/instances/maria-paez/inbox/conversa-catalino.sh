#!/bin/bash
cat > /tmp/cc2.cjs <<'JS'
const db=require("/root/secretaria/node_modules/better-sqlite3")(process.env.MARIA_DB,{readonly:true});
console.log("── últimos 12 mensajes con Diego (WA+TG) ──");
db.prepare(`SELECT timestamp,canal,direccion,substr(cuerpo,1,110) c FROM eventos WHERE usuario_id=1 AND canal IN ('whatsapp','telegram') ORDER BY id DESC LIMIT 12`).all()
  .reverse().forEach(x=>console.log(" ",x.timestamp.slice(5,16),x.canal.slice(0,3),x.direccion==='entrante'?'←':'→',String(x.c).replace(/\n/g," ")));
db.close();
JS
node /tmp/cc2.cjs; rm -f /tmp/cc2.cjs
echo LISTO
