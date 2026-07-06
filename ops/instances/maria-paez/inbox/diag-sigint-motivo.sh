#!/bin/bash
echo "── pm2.log: motivo de los kills ──"
grep -B2 "maria-paez.*SIGINT" /root/.pm2/pm2.log | grep -vE "^\-\-" | tail -12
grep -iE "memory|1024|exceeded" /root/.pm2/pm2.log | tail -5
echo "── memoria actual del proceso ──"
pm2 jlist 2>/dev/null | python3 -c "
import json,sys
for p in json.load(sys.stdin):
    if p['name']=='maria-paez':
        print('monit:', p.get('monit'))
        print('max_memory_restart:', p['pm2_env'].get('max_memory_restart'))
"
echo "── vendedora: ¿toca pm2 apps ajenas? ──"
grep -nE "pm2 (reload|restart|delete|stop)" /root/vendedora/ops/cron-master.sh 2>/dev/null | head -5
ls /root/vendedora/config/instances/ 2>/dev/null
echo LISTO
