#!/bin/bash
cd /root/secretaria
tail -5 /tmp/canary-tick.log 2>/dev/null | cut -c1-120
timeout 120 pm2 reload ecosystem.config.js --update-env >/dev/null 2>&1 && echo "reload OK"
sleep 100
pm2 jlist 2>/dev/null | python3 -c "import json,sys,time;[print(' ',p['name'],p['pm2_env']['status'],'uptime_s',int((time.time()*1000-p['pm2_env']['pm_uptime'])//1000)) for p in json.load(sys.stdin) if p['name']!='intensa-api']"
grep -h "expirado" /root/.pm2/logs/maria-paez-out.log | tail -12 | cut -c1-140
sqlite3 /root/secretaria/state/maria-paez/db/maria.sqlite "select estado,count(*) from follow_ups group by 1"
tail -2 /root/.pm2/logs/maria-paez-error.log /root/.pm2/logs/sofia-bruscoli-error.log | cut -c1-140
echo LISTO
