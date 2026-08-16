#!/bin/bash
pgrep -f mb-build-worker >/dev/null && echo compilando || echo terminó
grep "APK_OK\|APK_FAIL" /root/mariabridge-build.log | tail -2
echo "json:"; curl -s https://intensa.io/_dl/mariabridge-latest.json | head -3
echo LISTO
