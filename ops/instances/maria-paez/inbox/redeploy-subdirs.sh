#!/bin/bash
# Re-deploy con el fix de subdirs en deploy.sh + smoke tests detallados.
set +e
cd /root/secretaria/ops/sites/intensa.io
echo "═══ 1. Limpiar dirs viejos en docroot (para forzar re-sync limpio) ═══"
rm -rf /var/www/intensa.io/maria/signup /var/www/intensa.io/maria/cuenta /var/www/intensa.io/maria/terminos 2>/dev/null
ls /var/www/intensa.io/maria/

echo
echo "═══ 2. bash deploy.sh ═══"
bash deploy.sh 2>&1 | tail -25

echo
echo "═══ 3. Verificar dirs deployados ═══"
ls -la /var/www/intensa.io/maria/
echo "  signup/:"
ls /var/www/intensa.io/maria/signup/ 2>/dev/null
echo "  cuenta/:"
ls /var/www/intensa.io/maria/cuenta/ 2>/dev/null
echo "  terminos/:"
ls /var/www/intensa.io/maria/terminos/ 2>/dev/null

echo
echo "═══ 4. Smoke tests con contenido ═══"
echo "  /maria/terminos/ status:"
curl -sk -o /dev/null -w "    %{http_code}\n" https://intensa.io/maria/terminos/
echo "  signup checkbox términos:"
curl -sk https://intensa.io/maria/signup/ | grep -o 'name="acepto_terminos" required' | head -1
echo "  cuenta turnstile sitekey:"
curl -sk https://intensa.io/maria/cuenta/ | grep -o 'data-sitekey="0x4AAAAAA[A-Za-z0-9_-]*"' | head -1
echo "  landing footer terminos link:"
curl -sk https://intensa.io/maria/ | grep -o 'href="/maria/terminos/"' | head -1
echo "  landing Confold copyright:"
curl -sk https://intensa.io/maria/ | grep -o 'Confold' | head -1
echo "  backend rechaza signup sin terminos:"
curl -sk -X POST -H "Content-Type: application/json" \
  -d '{"nombre":"test","email":"t@t.com","wa":"5491111111111","calendar_provider":"google"}' \
  https://intensa.io/maria/api/signup/start | head -1
echo
echo "  backend acepta signup CON terminos:"
curl -sk -X POST -H "Content-Type: application/json" \
  -d '{"nombre":"test","email":"smoke-test-doNotUse@test.invalid","wa":"5491999999999","calendar_provider":"google","acepto_terminos":true}' \
  https://intensa.io/maria/api/signup/start
echo

echo "═══ DONE ═══"
