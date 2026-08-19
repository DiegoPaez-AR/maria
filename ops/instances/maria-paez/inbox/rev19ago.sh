#!/bin/bash
cat > /tmp/rp.cjs <<'JS'
const db=require("/root/secretaria/node_modules/better-sqlite3")(process.env.MARIA_DB,{readonly:true});
const q=(s,...a)=>db.prepare(s).all(...a);
console.log("═══ 1. VINCULACIONES TG (conversión de la campaña) ═══");
console.log("vinculados:", db.prepare("SELECT COUNT(*) n FROM usuarios WHERE telegram_chat_id IS NOT NULL").get().n,
            "/ activos:", db.prepare("SELECT COUNT(*) n FROM usuarios WHERE activo=1").get().n);
q("SELECT nombre FROM usuarios WHERE telegram_chat_id IS NOT NULL").forEach(x=>console.log("  ✓",x.nombre));
console.log("═══ 2. TRÁFICO últimas 24h por canal/dirección ═══");
q(`SELECT canal,direccion,COUNT(*) n FROM eventos WHERE timestamp>=datetime('now','-24 hours') AND canal IN ('whatsapp','telegram','gmail') GROUP BY canal,direccion ORDER BY canal`)
 .forEach(x=>console.log(" ",x.canal,x.direccion+":",x.n));
console.log("═══ 3. WA saliente (debe ser 0 desde el apagado) ═══");
q(`SELECT timestamp,substr(cuerpo,1,45) c FROM eventos WHERE canal='whatsapp' AND direccion='saliente' AND timestamp>='2026-08-18 21:00' ORDER BY id`)
 .forEach(x=>console.log("  ⚠️",x.timestamp.slice(5,16),String(x.c).replace(/\n/g," ")));
console.log("═══ 4. outbox/programados vivos ═══");
console.log("  outbox pendiente:", db.prepare("SELECT COUNT(*) n FROM wa_outbox WHERE estado='pendiente'").get().n);
q(`SELECT id,cuando,enviado,razon FROM programados WHERE enviado IN (0,-2) AND cuando<=datetime('now','+48 hours') ORDER BY cuando LIMIT 12`)
 .forEach(x=>console.log("  prog#"+x.id,x.cuando.slice(5,16),"env:"+x.enviado,x.razon||""));
console.log("═══ 5. gestiones abiertas ═══");
q(`SELECT id,usuario_id,substr("desc",1,70) d FROM pendientes WHERE estado='abierto' ORDER BY id DESC LIMIT 10`)
 .forEach(x=>console.log("  #"+x.id,"u"+x.usuario_id,String(x.d).replace(/\n/g," ")));
console.log("═══ 6. errores/fallas 24h ═══");
q(`SELECT substr(cuerpo,1,90) c,COUNT(*) n FROM eventos WHERE canal='sistema' AND timestamp>=datetime('now','-24 hours') AND (cuerpo LIKE '%FALL%' OR cuerpo LIKE '%error%' OR cuerpo LIKE '%no pude%') GROUP BY substr(cuerpo,1,40) ORDER BY n DESC LIMIT 8`)
 .forEach(x=>console.log(" ",x.n+"x",String(x.c).replace(/\n/g," ")));
db.close();
JS
node /tmp/rp.cjs; rm -f /tmp/rp.cjs
echo "═══ 7. salud del sistema ═══"
pm2 jlist 2>/dev/null | python3 -c "
import json,sys,time
for p in json.load(sys.stdin):
    e=p['pm2_env']; print(' ',p['name'],e.get('status'),'restarts:',e.get('restart_time'),'uptime_h:',round((time.time()*1000-e.get('pm_uptime',0))/3600000,1),'mem:',round(p['monit']['memory']/1048576),'MB')"
df -h / | tail -1 | awk '{print "  disco:",$5,"usado ("$4" libre)"}'
free -h | awk 'NR==2{print "  RAM:",$3"/"$2}'
echo "═══ 8. MariaBridge (últimos logs) ═══"
grep "\[MB " ~/.pm2/logs/maria-paez-out.log | tail -8
echo "═══ 9. backups + canary ═══"
ls -la /root/secretaria/state/.canary-bad-commit 2>/dev/null && echo "  ⚠️ CANARY BLOQUEADO" || echo "  canary limpio"
git -C /root/secretaria log origin/backups -1 --format="  último backup: %cr" 2>/dev/null || echo "  (sin info de backups)"
echo LISTO
