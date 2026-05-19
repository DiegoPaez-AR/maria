#!/bin/bash
set +e

echo "═══ 1. Clientes en control.clientes ═══"
sqlite3 -header -column /root/secretaria/state/control/control.sqlite \
  "SELECT id, nombre, email, wa, estado, instancia_slug, instancia_usuario_id, datetime(creado), lemon_subscription_id FROM clientes ORDER BY id DESC LIMIT 10;"

echo
echo "═══ 2. Webhook events recibidos de LS ═══"
sqlite3 -header -column /root/secretaria/state/control/control.sqlite \
  "SELECT id, event_name, procesado, substr(COALESCE(error,''),1,80), datetime(recibido_en) FROM webhook_events ORDER BY id DESC LIMIT 10;"

echo
echo "═══ 3. Usuarios creados en maria-paez (últimos 5) ═══"
sqlite3 -header -column /root/secretaria/state/maria-paez/db/maria.sqlite \
  "SELECT id, nombre, email, wa_cus, calendar_acceso, activo, bienvenida_enviada, lemon_customer_id, datetime(creado_en) FROM usuarios ORDER BY id DESC LIMIT 5;"

echo
echo "═══ 4. Eventos recientes en eventos de maria-paez (busco bienvenida) ═══"
sqlite3 -header -column /root/secretaria/state/maria-paez/db/maria.sqlite \
  "SELECT id, datetime(timestamp), direccion, substr(de||para,1,30), substr(cuerpo,1,80) FROM eventos WHERE direccion='saliente' OR cuerpo LIKE '%bienvenida%' ORDER BY id DESC LIMIT 10;"

echo
echo "═══ 5. Logs intensa-api (webhook + signup) ═══"
pm2 logs intensa-api --lines 200 --nostream 2>&1 | grep -iE "webhook|cliente|signup_pending id=|sendEmail|sendWa|cuenta/login|portal_otp" | tail -30

echo
echo "═══ 6. Logs maria-paez (bienvenida + internal-api) ═══"
pm2 logs maria-paez --lines 300 --nostream 2>&1 | grep -iE "bienvenida|internal-api/send|nuevo usuario" | tail -20

echo
echo "═══ 7. portal_otp activos ═══"
sqlite3 -header -column /root/secretaria/state/control/control.sqlite \
  "SELECT id, cliente_id, canal, code, usado, datetime(creado), datetime(expira_en) FROM portal_otp ORDER BY id DESC LIMIT 10;"

echo
echo "═══ 8. Test portal: pedir código a un email ═══"
# Si Diego ya es cliente, esto debería mandar OTP. Si no, devuelve OK silencioso.
curl -sk -X POST -H "Content-Type: application/json" \
  -d '{"canal":"email","identificador":"diego@paez.is","turnstile_token":"skip"}' \
  https://intensa.io/maria/api/cuenta/login
echo
sleep 1
echo
echo "  últimos logs intensa-api post-request:"
pm2 logs intensa-api --lines 20 --nostream 2>&1 | tail -10

echo
echo "═══ DONE ═══"
