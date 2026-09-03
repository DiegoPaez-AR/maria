#!/bin/bash
cd /root/secretaria
cat state/.canary-bad-commit 2>/dev/null && echo "CANARY MALO" || echo "canary limpio"
timeout 20 pm2 jlist 2>/dev/null | python3 -c "
import json,sys,time
for p in json.load(sys.stdin):
    if p['name']!='maria-paez': continue
    print('pm2',p['pm2_env']['status'],'up=%dmin'%((time.time()*1000-p['pm2_env']['pm_uptime'])/60000))"
echo "plataforma en loop-guard: $(grep -c PLATAFORMA loop-guard.js) | soft en healthcheck: $(grep -c SOFT_MIN ops/scripts/healthcheck-notify.sh)"
echo "── healthcheck ahora ──"; timeout 60 bash ops/scripts/healthcheck-notify.sh 2>&1 | tail -3
echo LISTO
