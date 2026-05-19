#!/bin/bash
set +e

# Datos sabidos:
# - email: diego@paez.is
# - wa: 5491132317896
# - lemon_customer_id y lemon_subscription_id están en el payload del evento subscription_created
# - terminos_version: v1-2026-05-19

echo "═══ 1. Extraer lemon ids del payload almacenado del evento 3 ═══"
PAYLOAD=$(sqlite3 /root/secretaria/state/control/control.sqlite "SELECT payload FROM webhook_events WHERE id=3;")
LEMON_CUSTOMER_ID=$(echo "$PAYLOAD" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['attributes']['customer_id'])")
LEMON_SUBSCRIPTION_ID=$(echo "$PAYLOAD" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['id'])")
CUSTOMER_PORTAL=$(echo "$PAYLOAD" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['attributes'].get('urls',{}).get('customer_portal','') or '')")
RENEWS=$(echo "$PAYLOAD" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['attributes'].get('renews_at','') or '')")
echo "  lemon_customer_id=$LEMON_CUSTOMER_ID"
echo "  lemon_subscription_id=$LEMON_SUBSCRIPTION_ID"
echo "  customer_portal=$CUSTOMER_PORTAL"
echo "  renews_at=$RENEWS"

echo
echo "═══ 2. INSERT cliente en control.clientes ═══"
sqlite3 /root/secretaria/state/control/control.sqlite <<SQL
INSERT INTO clientes (
  nombre, email, wa, calendar_provider, instancia_slug, instancia_usuario_id, estado,
  lemon_customer_id, lemon_subscription_id, lemon_customer_portal,
  ultimo_cobro_en, proximo_cobro_en, ultimo_evento, ultimo_evento_en,
  terminos_aceptados_en, terminos_version
) VALUES (
  'Diego', 'diego@paez.is', '5491132317896', 'ninguno', 'maria-paez', NULL, 'active',
  '$LEMON_CUSTOMER_ID', '$LEMON_SUBSCRIPTION_ID', '$CUSTOMER_PORTAL',
  datetime('now'), '$RENEWS', 'subscription_created_recovered', datetime('now'),
  datetime('now'), 'v1-2026-05-19'
);
SELECT 'cliente_id_creado=' || last_insert_rowid();
SQL

CLIENTE_ID=$(sqlite3 /root/secretaria/state/control/control.sqlite "SELECT id FROM clientes WHERE email='diego@paez.is';")
echo "  cliente_id=$CLIENTE_ID"

echo
echo "═══ 3. ¿Diego ya existe como usuario activo en maria-paez? ═══"
EXISTING=$(sqlite3 /root/secretaria/state/maria-paez/db/maria.sqlite "SELECT id FROM usuarios WHERE email='diego@paez.is' OR wa_cus='5491132317896@c.us' OR rol='owner';" | head -1)
echo "  usuario existente: $EXISTING (owner Diego ya está cargado de antes)"

if [ -n "$EXISTING" ]; then
  echo
  echo "═══ 4. Diego YA es owner — actualizar el row para conectar con LS y activar ═══"
  sqlite3 /root/secretaria/state/maria-paez/db/maria.sqlite <<SQL
UPDATE usuarios
   SET activo = 1,
       bienvenida_enviada = 1,
       lemon_customer_id = '$LEMON_CUSTOMER_ID',
       lemon_subscription_id = '$LEMON_SUBSCRIPTION_ID',
       cliente_id = $CLIENTE_ID
 WHERE id = $EXISTING;
SQL
  # actualizar la fila de clientes con el usuario_id existente
  sqlite3 /root/secretaria/state/control/control.sqlite \
    "UPDATE clientes SET instancia_usuario_id=$EXISTING WHERE id=$CLIENTE_ID;"
  echo "  ✓ usuario id=$EXISTING actualizado con lemon_* y cliente_id=$CLIENTE_ID"
  echo "  ✓ bienvenida_enviada=1 (Diego no necesita bienvenida automática, ya es owner)"
else
  echo "  (no existía — habría que crear)"
fi

echo
echo "═══ 5. Marcar el webhook event 3 como procesado ═══"
sqlite3 /root/secretaria/state/control/control.sqlite \
  "UPDATE webhook_events SET procesado=1, procesado_en=datetime('now'), error='recovered manually' WHERE id=3;"

echo
echo "═══ 6. Estado final ═══"
echo "  clientes:"
sqlite3 -header -column /root/secretaria/state/control/control.sqlite \
  "SELECT id, nombre, email, wa, estado, instancia_slug, instancia_usuario_id, lemon_subscription_id FROM clientes;"
echo
echo "  usuario diego en maria-paez:"
sqlite3 -header -column /root/secretaria/state/maria-paez/db/maria.sqlite \
  "SELECT id, nombre, email, wa_cus, activo, rol, lemon_subscription_id, cliente_id FROM usuarios WHERE id=$EXISTING;"

echo
echo "═══ DONE ═══"
