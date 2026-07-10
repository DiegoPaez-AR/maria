#!/bin/bash
set -e
ST=/root/secretaria/state/maria-paez
rm -f "$ST/wa-retry-after"
cd /root/secretaria && pm2 restart maria-paez --update-env >/dev/null 2>&1
sleep 8
pm2 jlist | python3 -c "import json,sys; [print(p['name'], p['pm2_env']['status']) for p in json.load(sys.stdin) if p['name']=='maria-paez']"
grep -c "_sesionCacheada" /root/secretaria/whatsapp-handler.js
