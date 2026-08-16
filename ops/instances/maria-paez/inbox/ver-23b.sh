#!/bin/bash
pgrep -f mb-build-worker >/dev/null && echo compilando || echo terminó
grep "APK_OK\|APK_FAIL" /root/mariabridge-build.log | tail -1
curl -s https://intensa.io/_dl/mariabridge-latest.json; echo ""
echo LISTO
