#!/bin/bash
cd /root/secretaria; sleep 50
grep -E "^# (pass|fail)" /tmp/canary-tick.log; grep -n "^not ok" /tmp/canary-tick.log | head -3
git log --oneline -1 -- executor.js | cat
git diff --stat HEAD -- . ':!ops' ':!config' | tail -2
pm2 jlist 2>/dev/null | python3 -c "import json,sys,time;[print(' ',p['name'],p['pm2_env']['status'],'uptime_s',int((time.time()*1000-p['pm2_env']['pm_uptime'])//1000)) for p in json.load(sys.stdin) if p['name']!='intensa-api']"
echo LISTO
