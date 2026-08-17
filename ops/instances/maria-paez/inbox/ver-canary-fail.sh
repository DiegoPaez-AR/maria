#!/bin/bash
grep -A 20 "canary" /root/secretaria/state/cron-master.log 2>/dev/null | tail -25
ls /root/secretaria/state/.canary* 2>/dev/null
grep -B2 -A 8 "FAIL\|Error\|error" /var/log/maria-cron.log 2>/dev/null | tail -20
# el log real del cron:
tail -40 /root/secretaria/../maria-cron.log 2>/dev/null || find / -name "*.log" -path "*cron*" -newer /root/secretaria/state/.canary-bad-commit 2>/dev/null | head -3
echo "── probar el require de wa-send a mano con paths scratch ──"
cd /root/secretaria
env MARIA_DB=/tmp/x.sqlite node -e "require('./wa-send.js'); console.log('require OK')" 2>&1 | tail -3
echo LISTO
