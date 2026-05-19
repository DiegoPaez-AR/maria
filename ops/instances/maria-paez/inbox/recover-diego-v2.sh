#!/bin/bash
set +e
echo "═══ 1. Migrar schema control.clientes: agregar 'ninguno' al CHECK ═══"
# SQLite no soporta MODIFY CHECK. Usamos recreate de la tabla.
sqlite3 /root/secretaria/state/control/control.sqlite <<SQL
BEGIN;
ALTER TABLE clientes RENAME TO clientes_old;
CREATE TABLE clientes (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre                  TEXT NOT NULL,
  email                   TEXT NOT NULL UNIQUE,
  wa                      TEXT NOT NULL UNIQUE,
  calendar_provider       TEXT CHECK(calendar_provider IN ('google','microsoft','caldav','ninguno')),
  instancia_slug          TEXT NOT NULL,
  instancia_usuario_id    INTEGER,
  estado                  TEXT NOT NULL DEFAULT 'active' CHECK(estado IN ('active','inactive','cancelled')),
  lemon_customer_id       TEXT,
  lemon_subscription_id   TEXT UNIQUE,
  lemon_customer_portal   TEXT,
  ultimo_cobro_en         DATETIME,
  proximo_cobro_en        DATETIME,
  ultimo_evento           TEXT,
  ultimo_evento_en        DATETIME,
  creado                  DATETIME DEFAULT CURRENT_TIMESTAMP,
  actualizado             DATETIME DEFAULT CURRENT_TIMESTAMP,
  inactivado_en           DATETIME,
  cancelado_en            DATETIME,
  terminos_aceptados_en   DATETIME NOT NULL,
  terminos_version        TEXT,
  FOREIGN KEY (instancia_slug) REFERENCES instances(slug)
);
INSERT INTO clientes SELECT * FROM clientes_old;
DROP TABLE clientes_old;
CREATE INDEX idx_clientes_estado     ON clientes(estado);
CREATE INDEX idx_clientes_instancia  ON clientes(instancia_slug, estado);
CREATE INDEX idx_clientes_cancelado  ON clientes(cancelado_en) WHERE estado='cancelled';
COMMIT;
SQL
echo "  ✓ tabla clientes recreada con 'ninguno' en CHECK"

echo
echo "═══ 2. Extraer lemon ids del payload del evento 3 ═══"
PAYLOAD=$(sqlite3 /root/secretaria/state/control/control.sqlite "SELECT payload FROM webhook_events WHERE id=3;")
LEMON_CUSTOMER_ID=$(echo "$PAYLOAD" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['attributes']['customer_id'])")
LEMON_SUBSCRIPTION_ID=$(echo "$PAYLOAD" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['id'])")
CUSTOMER_PORTAL=$(echo "$PAYLOAD" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['attributes'].get('urls',{}).get('customer_portal','') or '')")
RENEWS=$(echo "$PAYLOAD" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['attributes'].get('renews_at','') or '')")
echo "  lemon_customer_id=$LEMON_CUSTOMER_ID  subscription=$LEMON_SUBSCRIPTION_ID"

echo
echo "═══ 3. INSERT cliente con calendar_provider='ninguno' ═══"
sqlite3 /root/secretaria/state/control/control.sqlite <<SQL
INSERT INTO clientes (
  nombre, email, wa, calendar_provider, instancia_slug, instancia_usuario_id, estado,
  lemon_customer_id, lemon_subscription_id, lemon_customer_portal,
  ultimo_cobro_en, proximo_cobro_en, ultimo_evento, ultimo_evento_en,
  terminos_aceptados_en, terminos_version
) VALUES (
  'Diego', 'diego@paez.is', '5491132317896', 'ninguno', 'maria-paez', 1, 'active',
  '$LEMON_CUSTOMER_ID', '$LEMON_SUBSCRIPTION_ID', '$CUSTOMER_PORTAL',
  datetime('now'), '$RENEWS', 'subscription_created_recovered', datetime('now'),
  datetime('now'), 'v1-2026-05-19'
);
SELECT 'cliente_id=' || last_insert_rowid();
SQL

CLIENTE_ID=$(sqlite3 /root/secretaria/state/control/control.sqlite "SELECT id FROM clientes WHERE email='diego@paez.is';")
echo "  cliente_id=$CLIENTE_ID"

echo
echo "═══ 4. Actualizar usuario Diego (owner, id=1) con lemon_* + cliente_id ═══"
sqlite3 /root/secretaria/state/maria-paez/db/maria.sqlite <<SQL
UPDATE usuarios
   SET lemon_customer_id = '$LEMON_CUSTOMER_ID',
       lemon_subscription_id = '$LEMON_SUBSCRIPTION_ID',
       cliente_id = $CLIENTE_ID,
       bienvenida_enviada = 1
 WHERE id = 1;
SELECT 'updated: ' || changes() || ' row(s)';
SQL

echo
echo "═══ 5. Incrementar usuarios_actuales de la instancia ═══"
sqlite3 /root/secretaria/state/control/control.sqlite \
  "UPDATE instances SET usuarios_actuales = usuarios_actuales + 1 WHERE slug='maria-paez';"

echo
echo "═══ 6. Marcar evento 3 como procesado ═══"
sqlite3 /root/secretaria/state/control/control.sqlite \
  "UPDATE webhook_events SET procesado=1, procesado_en=datetime('now'), error='recovered manually v2' WHERE id=3;"

echo
echo "═══ 7. Estado final ═══"
echo "  clientes:"
sqlite3 -header -column /root/secretaria/state/control/control.sqlite \
  "SELECT id, nombre, email, wa, estado, instancia_slug, instancia_usuario_id, lemon_subscription_id FROM clientes;"
echo
echo "  usuario Diego en maria-paez:"
sqlite3 -header -column /root/secretaria/state/maria-paez/db/maria.sqlite \
  "SELECT id, nombre, email, activo, rol, lemon_subscription_id, cliente_id FROM usuarios WHERE id=1;"
echo
echo "  instancia maria-paez:"
sqlite3 -header -column /root/secretaria/state/control/control.sqlite \
  "SELECT slug, usuarios_actuales, max_usuarios FROM instances;"

echo
echo "═══ 8. Smoke test portal /cuenta/login con diego@paez.is ═══"
sleep 1
curl -sk -X POST -H "Content-Type: application/json" \
  -d '{"canal":"email","identificador":"diego@paez.is","turnstile_token":"skip"}' \
  https://intensa.io/maria/api/cuenta/login
echo
echo "  Si llegaste a este punto: revisá tu email a diego@paez.is — debería estar el código de login."
echo "  (Si turnstile rechaza el 'skip', mandar el request desde el browser real con captcha resuelto)"

echo
echo "═══ DONE ═══"
