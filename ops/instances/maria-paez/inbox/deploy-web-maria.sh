#!/bin/bash
cd /root/secretaria
bash ops/sites/intensa.io/deploy.sh 2>&1 | tail -5
echo "── verificación en vivo ──"
curl -s https://intensa.io/maria/ | grep -c "Telegram"
curl -s https://intensa.io/maria/script.js | grep -c "Telegram"
echo LISTO
