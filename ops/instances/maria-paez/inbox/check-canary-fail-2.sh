#!/bin/bash
echo "── marker ──"
cat /root/secretaria/state/.canary-bad-commit 2>/dev/null || echo "(sin marker)"
echo "── pm2 ──"
pm2 jlist 2>/dev/null | python3 -c "import json,sys; [print(p['name'], p['pm2_env']['status'], 'restarts='+str(p['pm2_env']['restart_time'])) for p in json.load(sys.stdin) if p['name']=='maria-paez']"
echo "── canary en cron log ──"
grep -iE "canary" /root/secretaria/ops/.cron.log | tail -5
echo FIN
