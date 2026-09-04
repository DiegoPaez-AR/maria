#!/bin/bash
cd /root/secretaria
sleep 45
echo "── canary ──"; tail -3 /tmp/canary-tick.log 2>/dev/null
echo "── commit en disco ──"; git log --oneline -1 -- presentacion.js
echo "── pm2 ──"; pm2 jlist 2>/dev/null | python3 -c "import json,sys;[print(' ',p['name'],p['pm2_env']['status'],'restarts',p['pm2_env']['restart_time'], 'uptime_s', (__import__('time').time()*1000-p['pm2_env']['pm_uptime'])//1000) for p in json.load(sys.stdin)]"
for S in maria-paez sofia-bruscoli; do echo "── $S últimas ──"; tail -3 /root/.pm2/logs/$S-out.log | cut -c1-140; tail -2 /root/.pm2/logs/$S-error.log | cut -c1-140; done
echo LISTO
