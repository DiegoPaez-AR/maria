#!/bin/bash
cd /root/secretaria
cat state/.canary-bad-commit 2>/dev/null && echo "CANARY MALO" || echo "canary limpio"
echo "reglas en disco: $(grep -c "MODALIDAD DE REUNIONES" prompt-builder.js)+$(grep -c "OTRO USUARIO DE MARIA" prompt-builder.js)"
timeout 20 pm2 jlist 2>/dev/null | python3 -c "
import json,sys,time
for p in json.load(sys.stdin):
    if p['name']!='maria-paez': continue
    print('pm2',p['pm2_env']['status'],'up=%dmin'%((time.time()*1000-p['pm2_env']['pm_uptime'])/60000))"
echo LISTO
