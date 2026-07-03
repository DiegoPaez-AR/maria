#!/bin/bash
cd /root/secretaria
grep -E "canary (OK|FALLÓ)" ops/.cron.log | tail -1
cat /root/secretaria/state/.canary-bad-commit 2>/dev/null || echo "(sin marker)"
env -i PATH="$PATH" HOME=/root TZ=America/Argentina/Buenos_Aires npm test 2>&1 | grep -E "^# (tests|pass|fail)"
pm2 jlist 2>/dev/null | python3 -c "import json,sys; [print(p['name'], p['pm2_env']['status'], 'restarts='+str(p['pm2_env']['restart_time'])) for p in json.load(sys.stdin) if p['name']=='maria-paez']"
echo LISTO
