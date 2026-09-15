#!/bin/bash
cd /root/secretaria
echo "── build ──"; tail -3 /root/mariabridge-build.log | cut -c1-160
cat /var/www/intensa.io/_dl/mariabridge-latest.json 2>/dev/null; echo
echo "── canary/pm2 ──"; grep -E "^# (pass|fail)" /tmp/canary-tick.log | tr '\n' ' '; echo
pm2 jlist | python3 -c "import json,sys,time;[print(' ',p['name'],p['pm2_env']['status'],'up',int((time.time()*1000-p['pm2_env']['pm_uptime'])//60000),'min') for p in json.load(sys.stdin) if p['name']!='intensa-api']"
git log --oneline -1 -- wa-outbox.js | cat
echo "── teléfono: ¿ya bajó v4.9? ──"
grep -hE "\[MB v4\.[89]\].*\[upd\]|auto-tap|instal" logs/maria-paez/out.log | tail -4 | cut -c1-150
echo LISTO
