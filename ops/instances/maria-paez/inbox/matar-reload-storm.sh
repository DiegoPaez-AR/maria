#!/bin/bash
cd /root/secretaria
echo "── cron log: ¿reloads en loop? ──"
grep -cE "reloadProcessId|Applying action" ops/.cron.log
tail -5 ops/.cron.log
echo "── pm2 CLI colgados (fuera del daemon) ──"
ps aux | grep "pm2" | grep -v grep | grep -v "PM2" | awk '{print $2, $9, $11, $12, $13}'
# matar CLIs de pm2 colgados (el daemon es 'PM2 v...' en el nombre del proceso, no lo tocamos)
for pid in $(ps aux | grep "node /usr/local/bin/pm2" | grep -v grep | awk '{print $2}'); do
  echo "matando pm2 CLI colgado pid=$pid ($(ps -o etime= -p $pid 2>/dev/null | tr -d ' '))"
  kill -9 $pid 2>/dev/null
done
sleep 2
echo "── restart limpio ──"
pm2 delete maria-paez >/dev/null 2>&1
sleep 2
pm2 start ecosystem.config.js --only maria-paez >/dev/null 2>&1
pm2 save >/dev/null 2>&1
sleep 20
pm2 jlist 2>/dev/null | python3 -c "import json,sys; [print(p['name'], p['pm2_env']['status'], 'restarts='+str(p['pm2_env']['restart_time']), 'uptime_s='+str(int((__import__('time').time()*1000-p['pm2_env']['pm_uptime'])/1000))) for p in json.load(sys.stdin) if p['name']=='maria-paez']"
sleep 20
pm2 jlist 2>/dev/null | python3 -c "import json,sys; [print('a los 40s:', p['name'], p['pm2_env']['status'], 'restarts='+str(p['pm2_env']['restart_time'])) for p in json.load(sys.stdin) if p['name']=='maria-paez']"
grep -E "maria-paez.*(exited|SIGINT)" /root/.pm2/pm2.log | tail -2
echo LISTO
