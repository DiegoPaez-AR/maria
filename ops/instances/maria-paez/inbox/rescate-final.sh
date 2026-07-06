#!/bin/bash
rm -f /root/secretaria/state/maria-paez/tg-wa-down && echo "marker borrado"
sleep 25
pm2 jlist 2>/dev/null | python3 -c "import json,sys; [print(p['name'], p['pm2_env']['status'], 'restarts='+str(p['pm2_env']['restart_time'])) for p in json.load(sys.stdin) if p['name']=='maria-paez']"
grep -E "WA ready|MODO DEGRADADO|arrancando poll" /root/.pm2/logs/maria-paez-out.log | tail -4
sleep 20
pm2 jlist 2>/dev/null | python3 -c "import json,sys; [print('a los 45s:', p['name'], p['pm2_env']['status'], 'restarts='+str(p['pm2_env']['restart_time']))for p in json.load(sys.stdin) if p['name']=='maria-paez']"
echo LISTO
