#!/bin/bash
# Re-deploya intensa.io con los cambios de la sección "Capacidades y límites".
# El deploy.sh es idempotente — corre el sync + cache-bust + reload nginx.

set +e
cd /root/secretaria/ops/sites/intensa.io || { echo "ERROR: no encontré el src dir"; exit 1; }

echo "═══ Corriendo deploy.sh ═══"
bash deploy.sh

echo
echo "═══ Smoke test del anchor #capacidades ═══"
curl -sk "https://intensa.io/L0001/" | grep -E "id=\"capacidades\"|caps-grid|cap-num" | head -5

echo
echo "═══ HTTPS status code de la landing ═══"
curl -sk -o /dev/null -w "https://intensa.io/L0001/  →  %{http_code}\n" https://intensa.io/L0001/

echo
echo "═══ Tamaño del index deployado ═══"
ls -la /var/www/intensa.io/L0001/index.html /var/www/intensa.io/L0001/styles.css /var/www/intensa.io/L0001/script.js

echo
echo "═══ DONE ═══"
