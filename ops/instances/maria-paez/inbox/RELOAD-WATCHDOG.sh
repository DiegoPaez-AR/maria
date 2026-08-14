#!/bin/bash
cd /root/secretaria
# sembrar latido inicial (el canal está vivo ahora) para no alarmar de entrada
echo -n "$(date +%s)000" > /root/secretaria/state/maria-paez/wa-hook-latido
pm2 reload ecosystem.config.js --only maria-paez --update-env >/dev/null 2>&1
sleep 7
pm2 jlist | python3 -c "import json,sys; [print(p['name'], p['pm2_env']['status']) for p in json.load(sys.stdin) if p['name']=='maria-paez']"
grep -a "wa-hook-watchdog" /root/.pm2/logs/maria-paez-out.log | tail -2
echo "latido: $(cat /root/secretaria/state/maria-paez/wa-hook-latido)"
