#!/bin/bash
cd /root/secretaria
pm2 reload ecosystem.config.js --only maria-paez --update-env >/dev/null 2>&1
sleep 6
pm2 jlist | python3 -c "import json,sys; [print(p['name'], p['pm2_env']['status']) for p in json.load(sys.stdin) if p['name']=='maria-paez']"
grep -c "agenda:" /root/secretaria/wa-hook.js
