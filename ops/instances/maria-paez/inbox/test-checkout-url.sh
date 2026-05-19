#!/bin/bash
set +e
echo "═══ pm2 restart intensa-api para tomar el fix de signup.js ═══"
pm2 restart intensa-api --update-env 2>&1 | tail -3
sleep 5

echo
echo "═══ Smoke E2E: signup completo + ver el checkout_url devuelto ═══"
echo "  1. /signup/start"
R1=$(curl -sk -X POST -H "Content-Type: application/json" \
  -d '{"nombre":"Diego Paez","email":"smoke-checkout@test.invalid","wa":"5491999999997","calendar_provider":"ninguno","acepto_terminos":true}' \
  https://intensa.io/maria/api/signup/start)
echo "  resp: $R1"
SID=$(echo "$R1" | python3 -c "import sys,json; print(json.load(sys.stdin).get('signup_id',''))")

echo
echo "  2. extraer codes from DB y /signup/verify"
CODES=$(sqlite3 /root/secretaria/state/control/control.sqlite "SELECT email_code, wa_code FROM signup_pending WHERE id=$SID;")
EMAIL_CODE=$(echo "$CODES" | cut -d'|' -f1)
WA_CODE=$(echo "$CODES" | cut -d'|' -f2)
echo "  codes: email=$EMAIL_CODE wa=$WA_CODE"

R2=$(curl -sk -X POST -H "Content-Type: application/json" \
  -d "{\"signup_id\":$SID,\"email_code\":\"$EMAIL_CODE\",\"wa_code\":\"$WA_CODE\"}" \
  https://intensa.io/maria/api/signup/verify)
echo "  resp: $R2"
echo
echo "  checkout_url:"
echo "$R2" | python3 -c "import sys,json; d=json.load(sys.stdin); print('   ', d.get('checkout_url',''))"

echo
echo "  3. cleanup"
sqlite3 /root/secretaria/state/control/control.sqlite "DELETE FROM signup_pending WHERE email LIKE 'smoke-checkout%';"

echo
echo "═══ DONE ═══"
