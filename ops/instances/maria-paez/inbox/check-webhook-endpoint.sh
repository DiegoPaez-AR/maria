#!/bin/bash
set -u
SK=$(grep -E '^STRIPE_SECRET_KEY=' /root/secretaria/.env-intensa-api | cut -d= -f2-)
echo "== webhook endpoints configurados en Stripe =="
curl -s https://api.stripe.com/v1/webhook_endpoints -u "${SK}:" -G -d limit=10 \
 | python3 -c "
import json,sys
d=json.load(sys.stdin)
ds=d.get('data',[])
if not ds: print('  (NINGUNO configurado — hay que crear el endpoint)')
for e in ds:
  print('  id=',e['id'],'| status=',e.get('status'),'| url=',e.get('url'))
  evs=e.get('enabled_events',[])
  print('     eventos:', ', '.join(evs) if evs!=['*'] else '* (todos)')
"
