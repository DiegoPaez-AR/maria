#!/bin/bash
node -e "
const db=require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB);
const r=db.prepare(\"UPDATE wa_outbox SET estado='vencido' WHERE id=46 AND estado='pendiente'\").run();
console.log('#46 frenado:', r.changes);
console.log('── quién disparó el mensaje a Carolina (eventos 21:30-22:00 ART = 00:30-01:00 UTC) ──');
db.prepare(\"SELECT timestamp,canal,direccion,substr(cuerpo,1,90) c FROM eventos WHERE timestamp BETWEEN '2026-08-17 00:30' AND '2026-08-17 01:00' AND (cuerpo LIKE '%arolina%' OR cuerpo LIKE '%runatti%' OR canal='telegram') ORDER BY id LIMIT 10\").all().forEach(r=>console.log(r.timestamp.slice(11),r.canal,r.direccion,'|',String(r.c).replace(/\n/g,' ')));
db.close();"
echo "── restarts ahora (¿sigue reiniciando?) ──"
pm2 jlist 2>/dev/null | python3 -c "
import json,sys,time
for p in json.load(sys.stdin):
    print(p['name'],'restarts:',p['pm2_env'].get('restart_time'),'uptime_min:',round((time.time()*1000-p['pm2_env'].get('pm_uptime',0))/60000))"
echo LISTO
