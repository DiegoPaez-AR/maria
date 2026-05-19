#!/bin/bash
set +e
echo "═══ Clientes registrados en control.sqlite ═══"
sqlite3 -header -column /root/secretaria/state/control/control.sqlite \
  "SELECT id, nombre, email, wa, estado, instancia_slug FROM clientes ORDER BY id DESC LIMIT 20;"

echo
echo "═══ Sessions y OTPs activos del portal ═══"
sqlite3 -header -column /root/secretaria/state/control/control.sqlite \
  "SELECT COUNT(*) AS portal_sessions FROM portal_sessions WHERE expira_en > datetime('now');"
sqlite3 -header -column /root/secretaria/state/control/control.sqlite \
  "SELECT COUNT(*) AS portal_otp_activos FROM portal_otp WHERE usado=0 AND expira_en > datetime('now');"

echo
echo "═══ Logs intensa-api últimas 60 líneas (busco cuenta/login) ═══"
pm2 logs intensa-api --lines 200 --nostream 2>&1 | tail -60

echo
echo "═══ Endpoint cuenta/login con email NO registrado (smoke) ═══"
RESP=$(curl -sk -X POST -H "Content-Type: application/json" \
  -d '{"canal":"email","identificador":"diego@paez.is","turnstile_token":"skip"}' \
  https://intensa.io/maria/api/cuenta/login)
echo "  response: $RESP"

echo
echo "═══ Logs intensa-api después del request ═══"
sleep 1
pm2 logs intensa-api --lines 20 --nostream 2>&1 | tail -10

echo
echo "═══ DONE ═══"
