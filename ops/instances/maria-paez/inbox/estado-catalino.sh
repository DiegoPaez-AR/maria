#!/bin/bash
cat > /tmp/ec2.cjs <<'JS'
const db=require("/root/secretaria/node_modules/better-sqlite3")(process.env.MARIA_DB,{readonly:true});
console.log("── outbox: mensajes a Catalino / pendientes ──");
db.prepare(`SELECT id,creado,estado,intentos,numero,substr(texto,1,60) t FROM wa_outbox WHERE creado>=datetime('now','-3 hours') ORDER BY id`).all()
  .forEach(x=>console.log("  #"+x.id,x.creado.slice(11,16),x.estado,"int:"+x.intentos,x.numero,"|",String(x.t).replace(/\n/g," ")));
console.log("── contacto Catalino ──");
db.prepare(`SELECT id,nombre,whatsapp,email FROM contactos WHERE nombre LIKE '%atalino%'`).all()
  .forEach(x=>console.log("  #"+x.id,x.nombre,"|",x.whatsapp,"|",x.email||"sin mail"));
console.log("── lo que Maria dijo (últimos 15 min) ──");
db.prepare(`SELECT timestamp,canal,direccion,substr(cuerpo,1,120) c FROM eventos WHERE timestamp>=datetime('now','-15 minutes') AND canal IN ('whatsapp','telegram') ORDER BY id`).all()
  .forEach(x=>console.log(" ",x.timestamp.slice(11,19),x.canal.slice(0,3),x.direccion==='entrante'?'←':'→',String(x.c).replace(/\n/g," ")));
db.close();
JS
node /tmp/ec2.cjs; rm -f /tmp/ec2.cjs
echo "── logs MB (¿warm-up frenó algo?) ──"
grep "\[MB " ~/.pm2/logs/maria-paez-out.log | tail -8
echo LISTO
