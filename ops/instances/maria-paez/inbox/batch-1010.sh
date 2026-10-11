#!/bin/bash
cd /root/secretaria
setsid nohup bash /root/mb-build-worker.sh > /tmp/mb-build-410.log 2>&1 < /dev/null &
echo "build v4.10 lanzado"
sleep 50
grep -E "^# (pass|fail)" /tmp/canary-tick.log | tr '\n' ' '; echo
git log --oneline -1 -- executor.js | cat
timeout 120 pm2 reload ecosystem.config.js --update-env >/dev/null 2>&1 && echo "reload OK"
sleep 15
pm2 jlist | python3 -c "import json,sys,time;[print(' ',p['name'],p['pm2_env']['status'],'up_s',int((time.time()*1000-p['pm2_env']['pm_uptime'])//1000)) for p in json.load(sys.stdin) if p['name'] in ('maria-paez','sofia-bruscoli')]"
tail -2 logs/maria-paez/error.log | cut -c1-120
echo LISTO
