#!/bin/bash
set +e
cd /root/secretaria/ops/sites/intensa.io && bash deploy.sh 2>&1 | grep cache-bust | head -3
echo
pm2 restart intensa-api --update-env 2>&1 | tail -3
sleep 4

echo
echo "═══ Smoke: signup ya no pide calendar ═══"
echo "  HTML del signup tiene select de calendar?:"
COUNT=$(curl -sk https://intensa.io/maria/signup/ | grep -c 'select name="calendar_provider"')
echo "    select count = $COUNT (esperamos 0)"
echo
echo "  backend acepta signup SIN calendar_provider:"
curl -sk -X POST -H "Content-Type: application/json" \
  -d '{"nombre":"Test sincal","email":"sincal-2@invalid.test","wa":"5491999999996","acepto_terminos":true}' \
  https://intensa.io/maria/api/signup/start
echo
sqlite3 /root/secretaria/state/control/control.sqlite "DELETE FROM signup_pending WHERE email LIKE 'sincal-%';"

echo
echo "═══ Bonus: ver logs intensa-api de errores en signup recientes ═══"
pm2 logs intensa-api --lines 100 --nostream 2>&1 | grep -iE "ERROR.*signup|sendEmail|sendWa|signup_pending" | tail -20

echo
echo "═══ DONE ═══"
