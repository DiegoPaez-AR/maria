#!/bin/bash
cd /root/secretaria
timeout 60 pm2 reload ecosystem.config.js --only maria-paez --update-env >/dev/null 2>&1 && echo "reload OK"
sleep 5
timeout 20 pm2 jlist 2>/dev/null | python3 -c "
import json,sys,time
for p in json.load(sys.stdin):
    if p['name']!='maria-paez': continue
    print('pm2',p['pm2_env']['status'],'up=%dmin'%((time.time()*1000-p['pm2_env']['pm_uptime'])/60000))"
echo LISTO
