#!/bin/bash
set -u
IDB=/root/secretaria/state/maria-paez/db/maria.sqlite
CDB=$(grep -E '^CONTROL_DB=' /root/secretaria/.env-intensa-api | cut -d= -f2-); CDB=${CDB:-/root/secretaria/state/control/control.sqlite}
SK=$(grep -E '^STRIPE_SECRET_KEY=' /root/secretaria/.env-intensa-api | cut -d= -f2-)

echo "===== cliente santiago (control) ====="
sqlite3 -header -column "$CDB" "SELECT id, nombre, estado, stripe_subscription_id, cancelado_en, inactivado_en, ultimo_evento, ultimo_evento_en FROM clientes WHERE id=2;"
echo
echo "===== usuario 17 (instancia) — debería quedar activo=0 ====="
sqlite3 -header -column "$IDB" "SELECT id, nombre, activo FROM usuarios WHERE id=17;"
echo
echo "===== webhook_events recientes ====="
sqlite3 -header -column "$CDB" "SELECT id, event_name, procesado, COALESCE(error,'') err, recibido_en FROM webhook_events ORDER BY id DESC LIMIT 8;"
echo
echo "===== suscripción en Stripe (estado real) ====="
SUB=$(sqlite3 "$CDB" "SELECT stripe_subscription_id FROM clientes WHERE id=2;")
echo "sub=$SUB"
[ -n "$SUB" ] && curl -s "https://api.stripe.com/v1/subscriptions/${SUB}" -u "${SK}:" | python3 -c "import json,sys;d=json.load(sys.stdin);print('status=',d.get('status'),'| cancel_at_period_end=',d.get('cancel_at_period_end'),'| canceled_at=',d.get('canceled_at'),'| ended_at=',d.get('ended_at'))" 2>/dev/null
echo
echo "===== instancia: contador de usuarios ====="
sqlite3 -header -column "$CDB" "SELECT slug, usuarios_actuales, max_usuarios FROM instances;"
echo
echo "===== logs webhook (cancel/deleted/portal) ====="
pm2 logs intensa-api --lines 40 --nostream 2>/dev/null | grep -iE "cancel|deleted|subscription|portal|cliente|error" | tail -20
