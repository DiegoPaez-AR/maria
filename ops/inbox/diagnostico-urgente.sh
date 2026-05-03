#!/bin/bash
# DIAGNOSTICO URGENTE: Maria dejó de contestar WA después del patch debug
cd /root/secretaria
echo "═══ pm2 status ═══"
pm2 jlist | python3 -c "
import json, sys, time
ps = json.load(sys.stdin)
for p in ps:
    if p['name'] == 'maria':
        e = p.get('pm2_env', {})
        up = e.get('pm_uptime', 0)
        ago = int((time.time()*1000 - up)/1000) if up else -1
        print(f\"status={e.get('status')} restarts={e.get('restart_time')} pid={p.get('pid')} uptime_s={ago}\")
"

echo ""
echo "═══ últimos 80 logs de maria (out+err mezclados) ═══"
pm2 logs maria --lines 80 --nostream 2>&1 | tail -85

echo ""
echo "═══ tail del error log ═══"
tail -50 /root/.pm2/logs/maria-error.log 2>&1
