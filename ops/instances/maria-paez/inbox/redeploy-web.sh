#!/bin/bash
cd /root/secretaria && bash ops/sites/intensa.io/deploy.sh 2>&1 | tail -3
curl -s https://intensa.io/maria/ | grep -o "Precio simple" | head -1
echo LISTO
