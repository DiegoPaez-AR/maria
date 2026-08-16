#!/bin/bash
pgrep -f mb-build-worker >/dev/null && echo "── CORRIENDO ──" || echo "── terminó ──"
tail -25 /root/mariabridge-build.log 2>/dev/null
echo LISTO
