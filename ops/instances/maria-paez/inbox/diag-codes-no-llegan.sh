#!/bin/bash
set +e
echo "═══ pm2 logs intensa-api: últimos 80 con focus en signup ═══"
pm2 logs intensa-api --lines 200 --nostream 2>&1 | grep -iE "signup|sendEmail|sendWa|maria-paez respondió|signup_pending|POST /(start|verify)" | tail -40

echo
echo "═══ pm2 logs maria-paez: últimas 40 líneas que toquen internal-api ═══"
pm2 logs maria-paez --lines 300 --nostream 2>&1 | grep -iE "internal-api|send-wa|send-email|getNumberId" | tail -30

echo
echo "═══ Test internal-api directo: send-wa a 5491132317896 ═══"
INTERNAL_SECRET=$(grep '^ASISTENTE_INTERNAL_SECRET=' /root/secretaria/config/instances/maria-paez.conf | cut -d= -f2- | tr -d '"')
curl -s -X POST -H "Content-Type: application/json" -H "X-Intensa-Secret: $INTERNAL_SECRET" \
  -d '{"to":"5491132317896","body":"[diag] test de send-wa desde internal-api — '"$(date +%H:%M:%S)"'"}' \
  http://127.0.0.1:4501/send-wa
echo
echo
echo "═══ Test internal-api directo: send-email a diego@paez.is ═══"
curl -s -X POST -H "Content-Type: application/json" -H "X-Intensa-Secret: $INTERNAL_SECRET" \
  -d '{"to":"diego@paez.is","subject":"[diag] test send-email","html":"<p>diag '"$(date +%H:%M:%S)"'</p>"}' \
  http://127.0.0.1:4501/send-email
echo
echo
echo "═══ Test desde intensa-api → internal-api (simular el path real del signup) ═══"
# Hacer un signup completo y ver si los códigos efectivamente llegan
curl -sk -X POST -H "Content-Type: application/json" \
  -d '{"nombre":"Diego diag","email":"diego@paez.is","wa":"5491132317896","calendar_provider":"ninguno","acepto_terminos":true}' \
  https://intensa.io/maria/api/signup/start
echo
echo
echo "  ver si quedó signup_pending y los códigos generados:"
sqlite3 -header -column /root/secretaria/state/control/control.sqlite \
  "SELECT id, nombre, email, wa, email_code, wa_code, datetime(creado) FROM signup_pending WHERE email='diego@paez.is' ORDER BY id DESC LIMIT 1;"

echo
echo "═══ DONE ═══"
