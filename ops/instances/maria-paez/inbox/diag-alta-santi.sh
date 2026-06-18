#!/bin/bash
set +e
CTRL=/root/secretaria/state/control/control.sqlite
INST=/root/secretaria/state/maria-paez/db/maria.sqlite
EMAIL='santiago@paez.is'; WA='5491164393520'
echo "############ CONTROL DB ############"
echo "== tablas =="; sqlite3 "$CTRL" ".tables" 2>/dev/null
for T in signup_pending clientes webhook_events; do
  echo ""; echo "== $T (santiago) =="
  sqlite3 -header -line "$CTRL" "SELECT * FROM $T WHERE (email LIKE '%$EMAIL%' OR wa LIKE '%$WA%' OR CAST(payload AS TEXT) LIKE '%$EMAIL%' OR CAST(payload AS TEXT) LIKE '%$WA%') ORDER BY rowid DESC LIMIT 5;" 2>/dev/null | head -60
done
echo ""; echo "== últimos 5 webhook_events (cualquiera) =="
sqlite3 -header -line "$CTRL" "SELECT rowid,* FROM webhook_events ORDER BY rowid DESC LIMIT 5;" 2>/dev/null | head -50
echo ""
echo "############ INSTANCIA maria-paez ############"
echo "== usuario santiago en usuarios =="
sqlite3 -header -line "$INST" "SELECT id,nombre,email,wa_cus,wa_lid,activo,servido,bienvenida_enviada,lemon_customer_id,lemon_subscription_id,cliente_id,creado FROM usuarios WHERE email LIKE '%$EMAIL%' OR wa_cus LIKE '%$WA%' OR nombre LIKE '%antiago paez%' ORDER BY id DESC LIMIT 5;" 2>/dev/null
