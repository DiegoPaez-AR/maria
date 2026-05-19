#!/bin/bash
set +e
echo "═══ .conf de maria-paez ═══"
grep -E "ASISTENTE_INTERNAL|ASISTENTE_SLUG" /root/secretaria/config/instances/maria-paez.conf

echo
echo "═══ pm2 describe maria-paez (env) ═══"
pm2 jlist 2>/dev/null | python3 -c "
import json, sys
ps = json.load(sys.stdin)
for p in ps:
    if p['name'] == 'maria-paez':
        env = p['pm2_env']
        print(f\"  ASISTENTE_INTERNAL_PORT = {env.get('ASISTENTE_INTERNAL_PORT')}\")
        print(f\"  ASISTENTE_INTERNAL_SECRET = {env.get('ASISTENTE_INTERNAL_SECRET','')[:10]}…\")
        print(f\"  pid={p.get('pid')}\")
"

echo
echo "═══ pm2 logs maria-paez --lines 100 grep internal ═══"
pm2 logs maria-paez --lines 200 --nostream 2>&1 | grep -iE "internal-api|ASISTENTE_INTERNAL|bienvenida" | tail -20

echo
echo "═══ puerto 4501 ¿escuchando? ═══"
ss -tlnp 2>/dev/null | grep -E ":4501|:4080" || echo "  ni 4501 ni 4080 escuchando"

echo
echo "═══ Si maria-paez no tiene el env, restart con ecosystem ═══"
PM2_ENV=$(pm2 jlist 2>/dev/null | python3 -c "import json,sys; ps=json.load(sys.stdin); [print(p['pm2_env'].get('ASISTENTE_INTERNAL_PORT','')) for p in ps if p['name']=='maria-paez']")
if [ -z "$PM2_ENV" ]; then
  echo "  no tiene el env. Restarting con ecosystem..."
  pm2 delete maria-paez 2>/dev/null
  pm2 start /root/secretaria/ecosystem.config.js --only maria-paez
  pm2 save 2>&1 | tail -3
  sleep 8
  echo "  post-restart:"
  pm2 jlist 2>/dev/null | python3 -c "
import json, sys
ps = json.load(sys.stdin)
for p in ps:
    if p['name'] == 'maria-paez':
        env = p['pm2_env']
        print(f\"  ASISTENTE_INTERNAL_PORT = {env.get('ASISTENTE_INTERNAL_PORT')}\")
        print(f\"  pid={p.get('pid')}  status={env.get('status')}\")
"
  ss -tlnp 2>/dev/null | grep -E ":4501|:4080"
fi

echo
echo "═══ Final smoke ═══"
INTERNAL_SECRET=$(grep '^ASISTENTE_INTERNAL_SECRET=' /root/secretaria/config/instances/maria-paez.conf | cut -d= -f2- | tr -d '"')
curl -s -H "X-Intensa-Secret: $INTERNAL_SECRET" -o /dev/null -w "internal-api/health → %{http_code}\n" http://127.0.0.1:4501/health
