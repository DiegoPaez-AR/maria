#!/bin/bash
cat > /tmp/p1.cjs <<'JS'
const db=require("/root/secretaria/node_modules/better-sqlite3")(process.env.MARIA_DB,{readonly:true});
console.log("── eventos WA últimos 15 min ──");
db.prepare(`SELECT timestamp,direccion,de,nombre,substr(cuerpo,1,80) c FROM eventos WHERE canal='whatsapp' AND timestamp>=datetime('now','-15 minutes') ORDER BY id`).all()
  .forEach(x=>console.log(" ",x.timestamp.slice(11,19),x.direccion==='entrante'?'←':'→',(x.nombre||x.de||'').slice(0,20),"|",String(x.c).replace(/\n/g," ")));
console.log("── outbox reciente ──");
db.prepare(`SELECT id,estado,intentos,numero,substr(texto,1,45) t FROM wa_outbox ORDER BY id DESC LIMIT 3`).all()
  .forEach(x=>console.log("  #"+x.id,x.estado,"int:"+x.intentos,x.numero.slice(-8),"|",String(x.t).replace(/\n/g," ")));
db.close();
JS
node /tmp/p1.cjs; rm -f /tmp/p1.cjs
echo "── logs MB últimos ──"
grep "\[MB " ~/.pm2/logs/maria-paez-out.log | tail -8
echo LISTO
