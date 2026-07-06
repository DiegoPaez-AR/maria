#!/bin/bash
touch /root/secretaria/state/maria-paez/wa-apagado && echo "marker wa-apagado puesto"
rm -f /root/secretaria/state/maria-paez/tg-wa-down
cd /root/secretaria && pm2 restart maria-paez >/dev/null 2>&1 && echo "restart OK"
sleep 15
grep -E "WA APAGADO|arrancando poll" /root/.pm2/logs/maria-paez-out.log | tail -3
pm2 jlist 2>/dev/null | python3 -c "import json,sys; [print(p['name'], p['pm2_env']['status'], 'restarts='+str(p['pm2_env']['restart_time'])) for p in json.load(sys.stdin) if p['name']=='maria-paez']"
sleep 20
pm2 jlist 2>/dev/null | python3 -c "import json,sys; [print('a los 35s:', p['pm2_env']['status'], 'restarts='+str(p['pm2_env']['restart_time'])) for p in json.load(sys.stdin) if p['name']=='maria-paez']"
ps aux | grep -c "wwebjs\|chrom" 
echo LISTO
