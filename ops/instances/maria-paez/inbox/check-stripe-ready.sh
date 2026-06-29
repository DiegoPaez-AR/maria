#!/bin/bash
set -u
SK=$(grep -E '^STRIPE_SECRET_KEY=' /root/secretaria/.env-intensa-api | cut -d= -f2-)
echo "===== Estado de la cuenta Stripe ====="
curl -s https://api.stripe.com/v1/account -u "${SK}:" | python3 -c "
import json,sys
a=json.load(sys.stdin)
print('charges_enabled :', a.get('charges_enabled'))
print('payouts_enabled :', a.get('payouts_enabled'))
print('details_submitted:', a.get('details_submitted'))
print('country/currency:', a.get('country'), a.get('default_currency'))
caps=a.get('capabilities',{})
print('capability card_payments:', caps.get('card_payments'))
print('capability transfers    :', caps.get('transfers'))
req=a.get('requirements',{}) or {}
print('--- requirements ---')
print('disabled_reason :', req.get('disabled_reason'))
print('current_deadline:', req.get('current_deadline'))
print('currently_due   :', req.get('currently_due'))
print('past_due        :', req.get('past_due'))
print('pending_verification:', req.get('pending_verification'))
fr=a.get('future_requirements',{}) or {}
print('future currently_due:', fr.get('currently_due'))
"
echo
echo "===== Billing Portal: ¿hay configuración activa? ====="
curl -s https://api.stripe.com/v1/billing_portal/configurations -u "${SK}:" -G -d limit=5 | python3 -c "
import json,sys
d=json.load(sys.stdin); ds=d.get('data',[])
if not ds: print('  (NINGUNA — el portal NO está configurado todavía → /cuenta/portal fallará)')
for c in ds: print('  config=',c['id'],'| active=',c.get('active'),'| is_default=',c.get('is_default'))
"
