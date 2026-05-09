#!/bin/bash
set +e
echo "── crontab activo ──"
crontab -l 2>&1
echo
echo "── /tmp/maria-cron-master.lock está locked? ──"
ls -la /tmp/maria-cron*.lock 2>&1
echo
echo "── /root/secretaria/ops/.cron.log últimas 60 líneas ──"
tail -60 /root/secretaria/ops/.cron.log 2>&1
echo
echo "── proceso cron-master corriendo? ──"
ps auxf | grep -E 'cron-master|cron.sh|maria' | grep -v grep | head -10
