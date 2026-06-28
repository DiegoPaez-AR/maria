#!/bin/bash
set -u
ENV=/root/secretaria/.env-intensa-api
API=/root/secretaria/ops/backend/intensa-api
PRICE='price_1Tn9nbBSnDFb8JXIeSWmqhNN'

echo "===== 1) STRIPE_PRICE_ID en el .env ====="
cp -a "$ENV" "${ENV}.bak.$(date +%s)"
grep -vE '^STRIPE_PRICE_ID=' "$ENV" > "${ENV}.tmp"
{ echo "STRIPE_PRICE_ID=${PRICE}"; } >> "${ENV}.tmp"
mv "${ENV}.tmp" "$ENV"; chmod 600 "$ENV"
echo "keys (masked):"; sed -E 's/^([A-Za-z0-9_]+)=.*/\1=<set>/' "$ENV" | grep -E 'STRIPE|LEMON|PRICE'

echo
echo "===== 2) syntax-check del código ya reseteado en el VPS ====="
cd "$API"
for fjs in index.js lib/stripe.js lib/db.js routes/webhook.js routes/signup.js routes/cuenta.js; do
  node --check "$fjs" && echo "  ok $fjs" || { echo "  FALLA $fjs — ABORTO sin reload"; exit 1; }
done

echo
echo "===== 3) reload via ecosystem (corre migración en el boot) ====="
cd /root/secretaria
pm2 reload ecosystem.config.js --only intensa-api --update-env 2>&1 | tail -4
sleep 3

echo
echo "===== 4) verificaciones ====="
PID=$(pm2 jlist 2>/dev/null | python3 -c "import json,sys
for p in json.load(sys.stdin):
  if p.get('name')=='intensa-api': print(p.get('pid'))")
echo "pid=$PID"
for k in STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET STRIPE_PRICE_ID; do
  tr '\0' '\n' < /proc/$PID/environ | grep -q "^$k=" && echo "  env $k=PRESENTE" || echo "  env $k=AUSENTE"
done
CDB=$(grep -E '^CONTROL_DB=' "$ENV" | cut -d= -f2-)
echo "columnas stripe en clientes:"; sqlite3 "${CDB}" "PRAGMA table_info(clientes);" 2>&1 | grep -i stripe || echo "  NO aparecen (mal)"
echo "estado pm2:"; pm2 jlist 2>/dev/null | python3 -c "import json,sys
for p in json.load(sys.stdin):
  if p.get('name')=='intensa-api':
    e=p.get('pm2_env',{}); print('  status=',e.get('status'),'restarts=',e.get('restart_time'))"
ss -ltnp 2>/dev/null | grep -q 4080 && echo "  :4080 OK" || echo "  :4080 CAIDO"

echo
echo "===== 5) probes ====="
echo -n "GET /health → "; curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:4080/health
echo -n "POST /webhook sin firma (espera 401) → "; curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:4080/webhook -H 'Content-Type: application/json' -d '{}'

echo
echo "===== 6) crear Checkout Session de prueba (gratis, expira sin uso) ====="
SK=$(grep -E '^STRIPE_SECRET_KEY=' "$ENV" | cut -d= -f2-)
curl -s https://api.stripe.com/v1/checkout/sessions \
  -u "${SK}:" \
  -d mode=subscription \
  -d "line_items[0][price]=${PRICE}" \
  -d "line_items[0][quantity]=1" \
  -d "client_reference_id=selftest" \
  -d "metadata[signup_token]=selftest" \
  -d "success_url=https://intensa.io/maria/signup/?status=ok" \
  -d "cancel_url=https://intensa.io/maria/signup/?status=cancel" \
  | python3 -c "import json,sys
d=json.load(sys.stdin)
if d.get('url'): print('  CHECKOUT OK → session',d.get('id'),'| url host=',d['url'].split('/')[2])
else: print('  CHECKOUT FALLÓ →', d.get('error',{}).get('message'))"

echo
echo "===== 7) últimas líneas de log (migración + boot) ====="
pm2 logs intensa-api --lines 20 --nostream 2>/dev/null | tail -20
