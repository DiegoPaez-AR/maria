#!/bin/bash
echo "── crontab ──"
crontab -l | grep -v "^#"
echo "── healthcheck script (si existe) ──"
for f in /root/secretaria/ops/scripts/healthcheck*.sh /root/secretaria/ops/healthcheck*; do
  [ -f "$f" ] && echo "=== $f ===" && grep -nE "restart|reload|kill|SIGINT|sleep|while|for" "$f" | head -15
done
echo "── procesos healthcheck/bash apilados ──"
ps aux | grep -cE "healthcheck"
ps aux | grep -E "healthcheck|watchdog" | grep -v grep | head -8
echo "── cuántos bash sueltos ──"
ps aux | grep -c "bash"
echo LISTO
