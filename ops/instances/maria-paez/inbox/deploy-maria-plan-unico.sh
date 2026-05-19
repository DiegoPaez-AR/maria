#!/bin/bash
# Deploy del rename L0001 → maria + cleanup del dir viejo.
set +e
cd /root/secretaria/ops/sites/intensa.io || { echo "ERROR: no encontre src dir"; exit 1; }

echo "═══ 1. Corriendo deploy.sh (sync + cache-bust + reload nginx) ═══"
bash deploy.sh

echo
echo "═══ 2. Borrar dir viejo /var/www/intensa.io/L0001/ (queda colgado tras el rename) ═══"
if [ -d /var/www/intensa.io/L0001 ]; then
  rm -rf /var/www/intensa.io/L0001
  echo "  borrado"
else
  echo "  no existía"
fi

echo
echo "═══ 3. Smoke test del nuevo path ═══"
curl -sk -o /dev/null -w "https://intensa.io/maria/   → HTTP %{http_code}\n" https://intensa.io/maria/
curl -sk "https://intensa.io/maria/" | grep -oE 'data-lemon-product="maria"|\$50<span class="period"|Un plan' | head -5

echo
echo "═══ 4. Verificar que L0001 retorna 404 ═══"
curl -sk -o /dev/null -w "https://intensa.io/L0001/  → HTTP %{http_code} (esperamos 404)\n" https://intensa.io/L0001/

echo
echo "═══ 5. Listado del docroot deployado ═══"
ls -la /var/www/intensa.io/

echo
echo "═══ DONE ═══"
