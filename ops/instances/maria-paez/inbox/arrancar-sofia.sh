#!/bin/bash
cd /root/secretaria
echo "── arranco la instancia sofia-bruscoli ──"
timeout 90 pm2 reload ecosystem.config.js --update-env 2>&1 | grep -E "sofia|maria-paez|✓|error" | head -6
sleep 12
timeout 20 pm2 jlist 2>/dev/null | python3 -c "
import json,sys,time
for p in json.load(sys.stdin):
    if 'sofia' in p['name'] or 'maria' in p['name']:
        e=p['pm2_env']; print('  '+p['name'], e['status'], 'restarts='+str(e['restart_time']), 'up=%ds'%((time.time()*1000-e['pm_uptime'])/1000))"
echo "── arranque en el log ──"
timeout 10 tail -25 /root/.pm2/logs/sofia-bruscoli-out.log 2>/dev/null | grep -E "iniciando|Owner|Usuarios|✓|▸|⚠|error|Error" | head -14
timeout 10 tail -5 /root/.pm2/logs/sofia-bruscoli-error.log 2>/dev/null
echo "── smoke del webhook ──"
SEC=$(grep -E '^WA_HOOK_SECRET=' config/instances/sofia-bruscoli.conf | cut -d= -f2)
curl -s -m 15 -X POST "https://intensa.io/hooks/wa-sofia-bruscoli/$SEC" -H 'Content-Type: application/json' -d '{"query":{"sender":"000","message":"ping","isTestMessage":true}}'; echo
echo LISTO
