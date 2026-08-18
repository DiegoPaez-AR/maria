#!/bin/bash
cd /root/secretaria && bash ops/sites/intensa.io/deploy.sh 2>&1 | tail -3
echo "── verificación ──"
curl -s https://intensa.io/maria/ | grep -c "se acuerda de todo"
curl -s https://intensa.io/maria/script.js | grep -c "mem.h2"
echo LISTO
