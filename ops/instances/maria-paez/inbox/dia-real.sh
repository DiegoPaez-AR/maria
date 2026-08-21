#!/bin/bash
echo "fecha VPS: $(date '+%Y-%m-%d %H:%M %Z')"
cat > /tmp/dr.cjs <<'JS'
const db=require("/root/secretaria/node_modules/better-sqlite3")(process.env.MARIA_DB,{readonly:true});
const q=(s,...a)=>db.prepare(s).all(...a);
console.log("═══ últimas 24h por canal ═══");
q(`SELECT canal,direccion,COUNT(*) n FROM eventos WHERE timestamp>=datetime('now','-24 hours') AND canal IN ('whatsapp','telegram','gmail') GROUP BY canal,direccion`)
 .forEach(x=>console.log(" ",x.canal,x.direccion+":",x.n));
console.log("═══ últimos 25 mensajes (cualquier canal) ═══");
q(`SELECT timestamp,canal,direccion,usuario_id,substr(cuerpo,1,60) c FROM eventos WHERE canal IN ('whatsapp','telegram','gmail') ORDER BY id DESC LIMIT 25`)
 .reverse().forEach(x=>console.log(" ",x.timestamp.slice(5,16),x.canal.slice(0,3),x.direccion==='entrante'?'←':'→',"u"+x.usuario_id,String(x.c).replace(/\n/g," ")));
console.log("═══ vinculados TG ═══");
q(`SELECT nombre FROM usuarios WHERE telegram_chat_id IS NOT NULL`).forEach(x=>console.log("  ✓",x.nombre));
console.log("═══ WA saliente últimas 48h (debe ser 0) ═══");
console.log("  ", db.prepare("SELECT COUNT(*) n FROM eventos WHERE canal='whatsapp' AND direccion='saliente' AND timestamp>=datetime('now','-48 hours')").get().n);
console.log("═══ gestiones creadas/cerradas últimas 48h ═══");
q(`SELECT id,usuario_id,estado,substr("desc",1,55) d FROM pendientes WHERE creado>=datetime('now','-48 hours') OR cerrado>=datetime('now','-48 hours') ORDER BY id`)
 .forEach(x=>console.log("  #"+x.id,"u"+x.usuario_id,x.estado,String(x.d).replace(/\n/g," ")));
console.log("═══ errores últimas 24h ═══");
q(`SELECT substr(cuerpo,1,70) c,COUNT(*) n FROM eventos WHERE canal='sistema' AND timestamp>=datetime('now','-24 hours') AND (cuerpo LIKE '%FALL%' OR cuerpo LIKE '%no pude%') GROUP BY substr(cuerpo,1,30) ORDER BY n DESC LIMIT 6`)
 .forEach(x=>console.log("  "+x.n+"x",String(x.c).replace(/\n/g," ")));
db.close();
JS
node /tmp/dr.cjs; rm -f /tmp/dr.cjs
echo "═══ MariaBridge: últimos 8 logs (sin filtro de fecha) ═══"
grep "\[MB " ~/.pm2/logs/maria-paez-out.log | tail -8
echo LISTO
