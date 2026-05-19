#!/bin/bash
set +e
sleep 3
echo "═══ Verificar que el backend acepta 'ninguno' como provider ═══"
RESP=$(curl -sk -X POST -H "Content-Type: application/json" \
  -d '{"nombre":"test-sincal","email":"sincal-verify@test.invalid","wa":"5491777777777","calendar_provider":"ninguno","acepto_terminos":true}' \
  https://intensa.io/maria/api/signup/start)
echo "  response: $RESP"
echo
echo "  Limpiar test signup..."
sqlite3 /root/secretaria/state/control/control.sqlite "DELETE FROM signup_pending WHERE email='sincal-verify@test.invalid';"

echo
echo "═══ Verificar que el backend RECHAZA un provider inválido ═══"
RESP2=$(curl -sk -X POST -H "Content-Type: application/json" \
  -d '{"nombre":"bad","email":"bad@test.invalid","wa":"5491666666666","calendar_provider":"XXX","acepto_terminos":true}' \
  https://intensa.io/maria/api/signup/start)
echo "  response: $RESP2"
echo
echo "═══ Estructura final del select ═══"
curl -sk https://intensa.io/maria/signup/ | grep -oE '<option value="[^"]*"' | head -10

echo
echo "═══ pm2 health ═══"
pm2 list | grep -E "maria-paez|intensa-api"
echo
echo "═══ DONE ═══"
