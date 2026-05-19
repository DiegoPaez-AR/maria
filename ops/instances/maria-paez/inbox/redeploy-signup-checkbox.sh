#!/bin/bash
set +e
cd /root/secretaria/ops/sites/intensa.io
bash deploy.sh 2>&1 | grep -E "cache-bust|→" | head -5
echo
echo "verificar checkbox simplificado:"
curl -sk "https://intensa.io/maria/signup/$(date +%s)" 2>/dev/null
# usar cache-bust query
curl -sk "https://intensa.io/maria/signup/" | grep -o 'step1.lbl-terminos">[^<]*' | head -1
echo
echo "DONE"
