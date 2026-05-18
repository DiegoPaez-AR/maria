#!/bin/bash
# Deploya intensa.io con la nueva landing L0001/ y hace smoke test
set -u

echo "═══ git pull ═══"
cd /root/secretaria
git fetch -q origin main
git log --oneline -3
ls -la ops/sites/intensa.io/L0001/ 2>&1

echo ""
echo "═══ deploy.sh ═══"
bash ops/sites/intensa.io/deploy.sh 2>&1

echo ""
echo "═══ smoke público (DNS) ═══"
# El que importa — desde fuera del nginx local, vía LB de Cloudflare/DNS resolución real
curl -sk -o /dev/null -w "https://intensa.io/L0001/ → %{http_code}  (%{size_download} bytes)\n" "https://intensa.io/L0001/"
curl -sk -o /dev/null -w "https://intensa.io/L0001/styles.css → %{http_code}\n" "https://intensa.io/L0001/styles.css"
curl -sk -o /dev/null -w "https://intensa.io/L0001/script.js  → %{http_code}\n" "https://intensa.io/L0001/script.js"
echo ""
echo "Primeros 30 lines del index sirvido:"
curl -sk "https://intensa.io/L0001/" | head -30
