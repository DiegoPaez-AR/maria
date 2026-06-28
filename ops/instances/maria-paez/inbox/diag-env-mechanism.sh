#!/bin/bash
set -u
echo "## index.js top 35 lineas:"
sed -n '1,35p' /root/secretaria/ops/backend/intensa-api/index.js
echo
echo "## ecosystem.config.js (busca intensa-api / env / env_file):"
grep -nE "intensa|env_file|env:|cwd|script|name" /root/secretaria/ecosystem.config.js 2>/dev/null | head -40
echo
echo "## ¿cómo se arrancó? buscar scripts que source .env-intensa-api o arranquen intensa-api:"
grep -rIln "env-intensa-api\|intensa-api" /root/secretaria/ops --include='*.sh' 2>/dev/null | head
echo
echo "## /proc/environ del proceso intensa-api: qué vars clave tiene (masked):"
PID=$(pm2 jlist 2>/dev/null | python3 -c "import json,sys
for p in json.load(sys.stdin):
  if p.get('name')=='intensa-api': print(p.get('pid'))")
echo "pid=$PID"
if [ -r /proc/$PID/environ ]; then
  for k in INTENSA_API_SECRET LEMON_WEBHOOK_SECRET LEMON_API_KEY STRIPE_WEBHOOK_SECRET CONTROL_DB INTENSA_API_PORT; do
    if tr '\0' '\n' < /proc/$PID/environ | grep -q "^$k="; then echo "$k=PRESENTE_en_environ"; else echo "$k=AUSENTE_en_environ"; fi
  done
fi
echo
echo "## ¿el proceso responde? healthcheck local a 4080:"
curl -s -o /dev/null -w "http_code=%{http_code}\n" http://127.0.0.1:4080/ 2>/dev/null || echo "curl falló"
echo
echo "## últimas 15 líneas de log de intensa-api:"
pm2 logs intensa-api --lines 15 --nostream 2>/dev/null | tail -15
