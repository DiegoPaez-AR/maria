#!/bin/bash
set -u
ENV=/root/secretaria/.env-intensa-api
PRICE=$(grep -E '^STRIPE_PRICE_ID=' "$ENV" | cut -d= -f2-)
SK=$(grep -E '^STRIPE_SECRET_KEY=' "$ENV" | cut -d= -f2-)
cd /root/secretaria
echo "== reload intensa-api (toma signup.js nuevo) =="
pm2 reload ecosystem.config.js --only intensa-api --update-env 2>&1 | tail -2
sleep 2
echo
echo "== checkout session con payment_method_types=card =="
curl -s https://api.stripe.com/v1/checkout/sessions \
  -u "${SK}:" \
  -d mode=subscription \
  -d "payment_method_types[0]=card" \
  -d "line_items[0][price]=${PRICE}" \
  -d "line_items[0][quantity]=1" \
  -d "client_reference_id=selftest" \
  -d "metadata[signup_token]=selftest" \
  -d "success_url=https://intensa.io/maria/signup/?status=ok" \
  -d "cancel_url=https://intensa.io/maria/signup/?status=cancel" \
  | python3 -c "import json,sys
d=json.load(sys.stdin)
if d.get('url'): print('CHECKOUT OK → session',d.get('id'),'| status=',d.get('status'),'| url host=',d['url'].split('/')[2])
else: print('CHECKOUT FALLÓ →', d.get('error',{}).get('message'))"
