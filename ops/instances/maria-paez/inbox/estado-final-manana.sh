#!/bin/bash
cd /root/secretaria
grep -E "canary (OK|FALLÓ)" ops/.cron.log | tail -2
grep -E "poda-eventos" ~/.pm2/logs/maria-paez-out.log 2>/dev/null | tail -1
pm2 jlist 2>/dev/null | python3 -c "import json,sys; [print(p['name'], p['pm2_env']['status'], 'restarts='+str(p['pm2_env']['restart_time'])) for p in json.load(sys.stdin)]"
echo LISTO
