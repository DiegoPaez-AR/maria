#!/bin/bash
cat > /tmp/dar.cjs <<'JS'
const db=require("/root/secretaria/node_modules/better-sqlite3")(process.env.MARIA_DB,{readonly:true});
console.log("── conversación completa últimos 40 min (WA + TG) ──");
db.prepare(`SELECT timestamp,canal,direccion,substr(cuerpo,1,130) c FROM eventos WHERE canal IN ('whatsapp','telegram') AND timestamp>=datetime('now','-40 minutes') ORDER BY id`).all()
  .forEach(x=>console.log(" ",x.timestamp.slice(11,19),x.canal.slice(0,3),x.direccion==='entrante'?'←':'→',String(x.c).replace(/\n/g," ")));
console.log("── acciones ejecutadas/fallidas últimos 40 min ──");
db.prepare(`SELECT timestamp,substr(cuerpo,1,110) c FROM eventos WHERE canal='sistema' AND timestamp>=datetime('now','-40 minutes') AND (cuerpo LIKE '%acción%' OR cuerpo LIKE '%FALL%') ORDER BY id`).all()
  .forEach(x=>console.log(" ",x.timestamp.slice(11,19),String(x.c).replace(/\n/g," ")));
console.log("── outbox reciente ──");
db.prepare(`SELECT id,creado,estado,intentos,numero,substr(texto,1,50) t FROM wa_outbox WHERE creado>=datetime('now','-40 minutes') ORDER BY id`).all()
  .forEach(x=>console.log("  #"+x.id,x.creado.slice(11,16),x.estado,"int:"+x.intentos,x.numero.slice(-8),"|",String(x.t).replace(/\n/g," ")));
db.close();
JS
node /tmp/dar.cjs; rm -f /tmp/dar.cjs
echo "── MB logs (audio/warmup) ──"
grep "\[MB " ~/.pm2/logs/maria-paez-out.log | tail -12
echo "── MB-MEDIA ──"; grep "MB-MEDIA" ~/.pm2/logs/maria-paez-out.log | tail -3
echo LISTO
