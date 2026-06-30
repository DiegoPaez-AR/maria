#!/bin/bash
# Publica intensa.io con el Google tag (AW-18285351437) ya inyectado en el
# fuente versionado (ops/sites/intensa.io/*.html). Verifica que quede live.
set -u
echo "===== 1) deploy del sitio (publica a /var/www + reload nginx) ====="
bash /root/secretaria/ops/sites/intensa.io/deploy.sh 2>&1 | tail -25
echo
echo "===== 2) gtag presente en /var/www ====="
for f in /var/www/intensa.io/index.html /var/www/intensa.io/maria/index.html \
         /var/www/intensa.io/maria/signup/index.html \
         /var/www/intensa.io/maria/cuenta/index.html \
         /var/www/intensa.io/maria/terminos/index.html; do
  if grep -q "AW-18285351437" "$f" 2>/dev/null; then echo "  OK   $f"; else echo "  FALTA $f"; fi
done
echo
echo "===== 3) gtag servido por HTTPS (curl local) ====="
for u in / /maria/ /maria/signup/ /maria/cuenta/ /maria/terminos/; do
  n=$(curl -sk -H "Host: intensa.io" "https://127.0.0.1${u}" | grep -c "AW-18285351437")
  echo "  ${u}  matches=${n}"
done
echo
echo "===== 4) success_url de Stripe (debe contener signup/?status=ok) ====="
grep -n "status=ok" /root/secretaria/ops/backend/intensa-api/routes/signup.js
echo "===== DONE ====="
