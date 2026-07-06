#!/bin/bash
echo "── watch en pm2? ──"
pm2 jlist 2>/dev/null | python3 -c "
import json,sys
for p in json.load(sys.stdin):
    e=p['pm2_env']
    print(p['name'], '→ watch:', e.get('watch'), '| autorestart:', e.get('autorestart'), '| exec_mode:', e.get('exec_mode'))
"
echo "── pm2.log: 'Change detected' (firma del watch) ──"
grep -c "Change detected" /root/.pm2/pm2.log
grep "Change detected" /root/.pm2/pm2.log | tail -3
echo LISTO
