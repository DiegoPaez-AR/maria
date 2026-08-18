#!/bin/bash
cd /root/secretaria && bash ops/sites/intensa.io/deploy.sh 2>&1 | tail -2
curl -s https://intensa.io/maria/script.js | grep -c "faq.11\|faq.12"
echo LISTO
