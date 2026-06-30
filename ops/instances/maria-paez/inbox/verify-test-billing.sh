#!/bin/bash
set -u
IDB=/root/secretaria/state/maria-paez/db/maria.sqlite
CDB=$(grep -E '^CONTROL_DB=' /root/secretaria/.env-intensa-api | cut -d= -f2-); CDB=${CDB:-/root/secretaria/state/control/control.sqlite}
SK=$(grep -E '^STRIPE_SECRET_KEY=' /root/secretaria/.env-intensa-api | cut -d= -f2-)

echo "===== webhook_events recientes ====="
sqlite3 -header -column "$CDB" "SELECT id, event_name, procesado, COALESCE(error,'') err, recibido_en FROM webhook_events ORDER BY id DESC LIMIT 8;"
echo
echo "===== cliente santiago (control) ====="
sqlite3 -header -column "$CDB" "SELECT id, nombre, estado, stripe_customer_id, stripe_subscription_id, ultimo_cobro_en, proximo_cobro_en, ultimo_evento FROM clientes WHERE id=2;"
echo
echo "===== usuario 17 (instancia) ====="
sqlite3 -header -column "$IDB" "SELECT id, nombre, activo, bienvenida_enviada, email, wa_cus FROM usuarios WHERE id=17;"
echo
echo "===== suscripción en Stripe (estado real) ====="
SUB=$(sqlite3 "$CDB" "SELECT stripe_subscription_id FROM clientes WHERE id=2;")
echo "sub=$SUB"
if [ -n "$SUB" ]; then
  curl -s "https://api.stripe.com/v1/subscriptions/${SUB}" -u "${SK}:" | python3 -c "import json,sys;d=json.load(sys.stdin);print('status=',d.get('status'),'| current_period_end=',d.get('current_period_end'),'| cancel_at_period_end=',d.get('cancel_at_period_end'))" 2>/dev/null
fi
echo
echo "===== últimas líneas de log webhook ====="
pm2 logs intensa-api --lines 30 --nostream 2>/dev/null | grep -iE "webhook|checkout|cliente|bienvenida|firma|signature|error" | tail -20
