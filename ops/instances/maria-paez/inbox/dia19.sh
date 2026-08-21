#!/bin/bash
cat > /tmp/d19.cjs <<'JS'
const db=require("/root/secretaria/node_modules/better-sqlite3")(process.env.MARIA_DB,{readonly:true});
const q=(s,...a)=>db.prepare(s).all(...a);
console.log("═══ ACTIVIDAD DE HOY por canal ═══");
q(`SELECT canal,direccion,COUNT(*) n FROM eventos WHERE timestamp>=date('now') AND canal IN ('whatsapp','telegram','gmail') GROUP BY canal,direccion`)
 .forEach(x=>console.log(" ",x.canal,x.direccion+":",x.n));
console.log("═══ ¿alguien se vinculó a TG hoy? ═══");
console.log("vinculados:", db.prepare("SELECT COUNT(*) n FROM usuarios WHERE telegram_chat_id IS NOT NULL").get().n,"/ 16");
q(`SELECT timestamp,substr(cuerpo,1,60) c FROM eventos WHERE canal='sistema' AND cuerpo LIKE '%telegram vinculado%' AND timestamp>=datetime('now','-2 days')`)
 .forEach(x=>console.log("  ✓",x.timestamp.slice(5,16),x.c));
console.log("═══ WA saliente hoy (debe ser 0) ═══");
console.log("  ", db.prepare("SELECT COUNT(*) n FROM eventos WHERE canal='whatsapp' AND direccion='saliente' AND timestamp>=date('now')").get().n);
console.log("═══ conversaciones de hoy (últimas 20) ═══");
q(`SELECT timestamp,canal,direccion,usuario_id,substr(cuerpo,1,65) c FROM eventos WHERE timestamp>=date('now') AND canal IN ('whatsapp','telegram','gmail') ORDER BY id DESC LIMIT 20`)
 .reverse().forEach(x=>console.log(" ",x.timestamp.slice(11,16),x.canal.slice(0,3),x.direccion==='entrante'?'←':'→',"u"+x.usuario_id,String(x.c).replace(/\n/g," ")));
console.log("═══ gestiones: nuevas/cerradas hoy ═══");
q(`SELECT id,usuario_id,estado,substr("desc",1,60) d FROM pendientes WHERE creado>=date('now') OR cerrado>=date('now') ORDER BY id`)
 .forEach(x=>console.log("  #"+x.id,"u"+x.usuario_id,x.estado,String(x.d).replace(/\n/g," ")));
console.log("═══ errores hoy ═══");
q(`SELECT substr(cuerpo,1,80) c,COUNT(*) n FROM eventos WHERE canal='sistema' AND timestamp>=date('now') AND (cuerpo LIKE '%FALL%' OR cuerpo LIKE '%no pude%' OR cuerpo LIKE '%error%') GROUP BY substr(cuerpo,1,35) ORDER BY n DESC LIMIT 6`)
 .forEach(x=>console.log("  "+x.n+"x",String(x.c).replace(/\n/g," ")));
db.close();
JS
node /tmp/d19.cjs; rm -f /tmp/d19.cjs
echo "═══ MariaBridge hoy ═══"
grep "\[MB " ~/.pm2/logs/maria-paez-out.log | grep "2026-08-19" | tail -6
echo "═══ pm2 ═══"
pm2 jlist 2>/dev/null | python3 -c "
import json,sys,time
for p in json.load(sys.stdin):
    e=p['pm2_env']; print(' ',p['name'],e.get('status'),'uptime_h:',round((time.time()*1000-e.get('pm_uptime',0))/3600000,1))"
echo LISTO
