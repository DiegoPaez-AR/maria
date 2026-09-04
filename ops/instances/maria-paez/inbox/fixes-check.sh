#!/bin/bash
cd /root/secretaria; sleep 40
echo "── canary ──"; grep -E "canary|OK|FALL" /tmp/canary-tick.log 2>/dev/null | tail -3
git log --oneline -1 -- wa-outbox.js
pm2 jlist 2>/dev/null | python3 -c "import json,sys;[print(' ',p['name'],p['pm2_env']['status'],'uptime_s',int((__import__('time').time()*1000-p['pm2_env']['pm_uptime'])//1000)) for p in json.load(sys.stdin) if p['name']!='intensa-api']"
tail -2 /root/.pm2/logs/sofia-bruscoli-error.log | cut -c1-140
echo LISTO
