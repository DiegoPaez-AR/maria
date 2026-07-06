#!/bin/bash
cd /root/secretaria
echo "── 1. estado general ──"
pm2 jlist 2>/dev/null | python3 -c "import json,sys; [print(p['name'], p['pm2_env']['status'], 'restarts='+str(p['pm2_env']['restart_time'])) for p in json.load(sys.stdin) if p['name']=='maria-paez']"
grep -E "WA ready|catch-up" ~/.pm2/logs/maria-paez-out.log | tail -6
echo ""
echo "── 2. el brief de las 4am: qué pasó ──"
grep -E "morning-brief|wa-send|fallback|TELEGRAM|telegram" ~/.pm2/logs/maria-paez-out.log | grep -E "^2026-07-06 0[4-7]" | head -15
grep -E "^2026-07-06 0[4-7]" ~/.pm2/logs/maria-paez-error.log | grep -viE "MODO DEGRADADO" | head -10
echo ""
echo "── 3. envíos del brief hoy en la DB ──"
node -e "
const db = require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB, {readonly:true});
const rows = db.prepare(\"SELECT timestamp, canal, substr(cuerpo,1,50) c, json_extract(metadata_json,'\$.tag') tag FROM eventos WHERE direccion='saliente' AND timestamp >= '2026-07-06 06:00:00' AND (cuerpo LIKE '%rief%' OR json_extract(metadata_json,'\$.tag') LIKE '%brief%') ORDER BY id\").all();
console.log(JSON.stringify(rows, null, 1));
db.close();
"
echo LISTO
