#!/bin/bash
pgrep -f mb-build-worker >/dev/null && echo compilando || echo terminó
grep -E "BUILD (SUCC|FAIL)|APK_OK|APK_FAIL|^e: file" /root/mariabridge-build.log | tail -3
curl -s https://intensa.io/_dl/mariabridge-latest.json; echo ""
echo LISTO
