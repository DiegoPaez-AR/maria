#!/bin/bash
cd /root/secretaria
[ -f state/.canary-bad-commit ] && { echo "CANARY BLOQUEÓ"; exit 0; }
if pgrep -f mb-build-worker >/dev/null; then echo "build corriendo"; else nohup bash /root/mb-build-worker.sh >/dev/null 2>&1 & echo "build v4.8 lanzado"; fi
sleep 120; tail -3 /root/mariabridge-build.log; cat /var/www/intensa.io/_dl/mariabridge-latest.json
