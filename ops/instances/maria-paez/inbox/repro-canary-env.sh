#!/bin/bash
cd /root/secretaria
echo "── npm test con env PELADO (como el canary) ──"
env -i PATH="$PATH" HOME=/root TZ=America/Argentina/Buenos_Aires \
  npm test 2>&1 | grep -B3 -A22 "^not ok" | head -60
echo "── resumen ──"
env -i PATH="$PATH" HOME=/root TZ=America/Argentina/Buenos_Aires \
  npm test 2>&1 | grep -E "^# (tests|pass|fail)"
echo LISTO
