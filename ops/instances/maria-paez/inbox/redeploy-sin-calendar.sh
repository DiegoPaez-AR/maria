#!/bin/bash
# Re-deploy: opción 'sin calendario' + corrección precio 49.99.
set +e
cd /root/secretaria/ops/sites/intensa.io
bash deploy.sh 2>&1 | grep -E "cache-bust" | head -5

echo
echo "═══ Smoke tests ═══"
echo "  landing precio:"
curl -sk https://intensa.io/maria/ | grep -oE '\$[0-9]+\.?[0-9]*<span class="period"' | head -1
echo "  signup texto USD 49.99:"
curl -sk https://intensa.io/maria/signup/ | grep -oE 'USD 49\.99/mes' | head -1
echo "  signup option 'sin calendario':"
curl -sk https://intensa.io/maria/signup/ | grep -oE 'value="ninguno"[^>]*>[^<]+' | head -1
echo
echo "═══ pm2 restart intensa-api para tomar el cambio del webhook handler ═══"
pm2 restart intensa-api --update-env 2>&1 | tail -3

echo
echo "  backend acepta 'ninguno' como provider:"
curl -sk -X POST -H "Content-Type: application/json" \
  -d '{"nombre":"test-sincal","email":"smoke-sincal@test.invalid","wa":"5491888888888","calendar_provider":"ninguno","acepto_terminos":true}' \
  https://intensa.io/maria/api/signup/start
echo
echo "  (limpiando signup test...)"
sqlite3 /root/secretaria/state/control/control.sqlite "DELETE FROM signup_pending WHERE email LIKE 'smoke-sincal%' OR email LIKE 'test@invalid%' OR email LIKE 'smoke-test-%';"

echo
echo "═══ DONE ═══"
