#!/bin/bash
set +e
cd /root/secretaria/ops/sites/intensa.io
bash deploy.sh 2>&1 | grep -E "cache-bust" | head -3
echo
echo "Verificar datos de Confold en producción:"
curl -sk "https://intensa.io/maria/terminos/" | grep -oE '(RUT 218377600011|Pradines Clemente 1795|Montevideo 11500)' | head -3
echo
echo "DONE"
