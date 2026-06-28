#!/bin/bash
set -u
cd /root/secretaria
echo "## reload via ecosystem.config.js (re-corre _intensaApiEnv que lee .env-intensa-api)"
pm2 reload ecosystem.config.js --only intensa-api --update-env 2>&1 | tail -6 \
  || pm2 startOrRestart ecosystem.config.js --only intensa-api 2>&1 | tail -6
sleep 2
PID=$(pm2 jlist 2>/dev/null | python3 -c "import json,sys
for p in json.load(sys.stdin):
  if p.get('name')=='intensa-api': print(p.get('pid'))")
echo "pid=$PID"
echo
echo "## vars clave en environ del proceso (masked):"
if [ -r /proc/$PID/environ ]; then
  for k in INTENSA_API_SECRET LEMON_WEBHOOK_SECRET LEMON_API_KEY STRIPE_WEBHOOK_SECRET CONTROL_DB; do
    if tr '\0' '\n' < /proc/$PID/environ | grep -q "^$k="; then echo "$k=PRESENTE"; else echo "$k=AUSENTE"; fi
  done
  echo
  echo "## STRIPE_WEBHOOK_SECRET (masked, confirmación de valor correcto):"
  tr '\0' '\n' < /proc/$PID/environ | grep '^STRIPE_WEBHOOK_SECRET=' | sed -E 's/=(.{6}).*/=\1…/'
fi
echo
echo "## status + puerto:"
pm2 jlist 2>/dev/null | python3 -c "import json,sys
for p in json.load(sys.stdin):
  if p.get('name')=='intensa-api':
    e=p.get('pm2_env',{}); print('status=',e.get('status'),'restarts=',e.get('restart_time'))"
ss -ltnp 2>/dev/null | grep 4080 || echo "(nada en 4080!)"
echo "## health:"
curl -s -o /dev/null -w "http_code=%{http_code}\n" http://127.0.0.1:4080/ 2>/dev/null
