#!/bin/bash
set +e
echo "═══ Últimos 40 requests al intensa-api ═══"
pm2 logs intensa-api --lines 200 --nostream 2>&1 | grep -E "POST|GET|ERROR|signup|cuenta" | tail -40

echo
echo "═══ signup_pending recientes (últimos 10) ═══"
sqlite3 -header -column /root/secretaria/state/control/control.sqlite \
  "SELECT id, substr(nombre,1,20) AS nombre, email, wa, calendar_provider, email_verified, wa_verified, datetime(creado) AS creado FROM signup_pending ORDER BY id DESC LIMIT 10;"

echo
echo "═══ Probar /signup/start con datos reales (no diego) ═══"
curl -sk -X POST -H "Content-Type: application/json" \
  -d '{"nombre":"Diag","email":"diag@invalid.test","wa":"5491999999998","calendar_provider":"ninguno","acepto_terminos":true}' \
  https://intensa.io/maria/api/signup/start
echo
echo
echo "═══ Limpiar ═══"
sqlite3 /root/secretaria/state/control/control.sqlite "DELETE FROM signup_pending WHERE email LIKE 'diag@invalid%';"

echo
echo "═══ DONE ═══"
