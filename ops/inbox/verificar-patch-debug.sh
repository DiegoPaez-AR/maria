#!/bin/bash
# Verifica que el patch de debug @lid está en el código corriendo en el VPS
cd /root/secretaria
echo "═══ commit actual ═══"
git log --oneline -1
echo ""
echo "═══ buscar wa-debug en handler ═══"
grep -c "wa-debug @lid" whatsapp-handler.js && echo "(patch presente)" || echo "(patch ausente)"
echo ""
echo "═══ pm2 maria status ═══"
pm2 jlist | python3 -c "
import json, sys
ps = json.load(sys.stdin)
for p in ps:
    if p['name'] == 'maria':
        e = p.get('pm2_env', {})
        print(f\"status={e.get('status')} restarts={e.get('restart_time')} pid={p.get('pid')} uptime_s={int((__import__('time').time()*1000 - e.get('pm_uptime',0))/1000)}\")
"
echo ""
echo "═══ ult 6 logs ═══"
pm2 logs maria --lines 6 --nostream 2>&1 | tail -8
