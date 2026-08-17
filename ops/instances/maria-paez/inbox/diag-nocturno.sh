#!/bin/bash
echo "── 1. pm2: restarts y uptime ──"
pm2 jlist 2>/dev/null | python3 -c "
import json,sys
for p in json.load(sys.stdin):
    print(p['name'], 'restarts:', p['pm2_env'].get('restart_time'), 'uptime_min:', round((__import__('time').time()*1000-p['pm2_env'].get('pm_uptime',0))/60000))"
echo "── 2. ¿qué es lo de Brunatti? outbox pendientes ──"
node -e "
const db=require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB,{readonly:true});
db.prepare(\"SELECT id,creado,estado,intentos,numero,substr(texto,1,60) t FROM wa_outbox WHERE estado='pendiente' ORDER BY id\").all().forEach(r=>console.log('#'+r.id,r.creado,'int:'+r.intentos,r.numero,'|',String(r.t).replace(/\n/g,' ')));
db.close();"
echo "── 3. pendiente nuevo del mail CC ──"
node -e "
const db=require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB,{readonly:true});
db.prepare(\"SELECT id,substr(\\\"desc\\\",1,100) d FROM pendientes WHERE creado>=datetime('now','-20 minutes') AND estado='abierto'\").all().forEach(r=>console.log('#'+r.id,'|',r.d));
db.close();"
echo "── 4. últimos logs MB (¿accesibilidad viva?) ──"
grep "\[MB " ~/.pm2/logs/maria-paez-out.log | grep -i "frio\|svc\|upd" | tail -5
echo LISTO
