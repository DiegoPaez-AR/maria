#!/bin/bash
echo "== restart maria-paez =="
pm2 restart maria-paez --update-env
sleep 45
echo "== logs post-restart =="
grep -i "ready\|authenticated\|qr\|error" /root/.pm2/logs/maria-paez-out.log | tail -8
tail -5 /root/.pm2/logs/maria-paez-error.log
pm2 jlist | python3 -c "import sys,json; [print(p['name'],p['pm2_env']['status'],'restarts:',p['pm2_env']['restart_time']) for p in json.load(sys.stdin) if p['name']=='maria-paez']"
