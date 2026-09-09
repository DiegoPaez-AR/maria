#!/bin/bash
cd /root/secretaria
rm -f ops/instances/maria-paez/snapshots/HEALTHCHECK-ALERT.json && echo "alert stale borrada"
sleep 45
git log --oneline -1 -- follow-ups.js
pm2 jlist 2>/dev/null | python3 -c "import json,sys,time;[print(' ',p['name'],p['pm2_env']['status'],'uptime_s',int((time.time()*1000-p['pm2_env']['pm_uptime'])//1000)) for p in json.load(sys.stdin) if p['name']!='intensa-api']"
sleep 60
echo "── follow-ups expirados ──"
grep -h "expirado" /root/.pm2/logs/maria-paez-out.log | tail -12 | cut -c1-140
sqlite3 /root/secretaria/state/maria-paez/db/maria.sqlite "select estado,count(*) from follow_ups group by 1"
tail -3 /root/.pm2/logs/maria-paez-error.log | cut -c1-140
echo LISTO
