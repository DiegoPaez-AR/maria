#!/bin/bash
set +e
echo "═══ 1. Limpiar y re-deploy ═══"
rm -rf /var/www/intensa.io/maria/signup /var/www/intensa.io/maria/cuenta /var/www/intensa.io/maria/terminos
cd /root/secretaria/ops/sites/intensa.io
bash deploy.sh 2>&1 | grep -E "═══|cache-bust|HTTP|→" | head -25

echo
echo "═══ 2. Estructura deployada ═══"
ls /var/www/intensa.io/maria/
echo "  cuenta:"
ls /var/www/intensa.io/maria/cuenta/
echo "  signup:"
ls /var/www/intensa.io/maria/signup/
echo "  terminos:"
ls /var/www/intensa.io/maria/terminos/

echo
echo "═══ 3. Smoke tests con asserts ═══"
function check() {
  local label=$1 cmd=$2 expected=$3
  local actual=$(eval "$cmd")
  if [ -n "$actual" ]; then
    echo "  ✓ $label: $(echo "$actual" | head -c 60)"
  else
    echo "  ✗ $label: VACÍO"
  fi
}
check "terminos HTTP 200" "curl -sk -o /dev/null -w '%{http_code}' https://intensa.io/maria/terminos/ | grep 200" "200"
check "signup checkbox" "curl -sk https://intensa.io/maria/signup/ | grep -o 'name=\"acepto_terminos\" required' | head -1" "match"
check "cuenta turnstile" "curl -sk https://intensa.io/maria/cuenta/ | grep -o 'data-sitekey=\"0x4AAAAAA[A-Za-z0-9_-]*\"' | head -1" "match"
check "terminos h1" "curl -sk https://intensa.io/maria/terminos/ | grep -o 'Términos y Condiciones' | head -1" "match"
check "terminos warn beta" "curl -sk https://intensa.io/maria/terminos/ | grep -o 'BETA' | head -1" "match"
check "terminos Confold S.A." "curl -sk https://intensa.io/maria/terminos/ | grep -o 'Confold S.A' | head -1" "match"
check "landing footer terminos link" "curl -sk https://intensa.io/maria/ | grep -o 'href=\"/maria/terminos/\"' | head -1" "match"
check "landing Confold copyright" "curl -sk https://intensa.io/maria/ | grep -o 'Confold S.A.' | head -1" "match"

echo
echo "═══ 4. Backend smoke ═══"
echo "  rechaza signup SIN terminos:"
curl -sk -X POST -H "Content-Type: application/json" \
  -d '{"nombre":"test","email":"test@invalid.fake","wa":"5491111111111","calendar_provider":"google"}' \
  https://intensa.io/maria/api/signup/start

echo
echo "  Limpia signup_pending de prueba previo (smoke-test-doNotUse@test.invalid)..."
sqlite3 /root/secretaria/state/control/control.sqlite "DELETE FROM signup_pending WHERE email LIKE 'smoke-test-%' OR email LIKE 'test@invalid%';" 2>&1

echo
echo "═══ DONE ═══"
