#!/bin/bash
pgrep -f mb-build-worker >/dev/null && echo compilando || echo terminó
grep -E "APK_OK|APK_FAIL|BUILD (SUCC|FAIL)|^e: file" /root/mariabridge-build.log | tail -4
curl -s https://intensa.io/_dl/mariabridge-latest.json 2>/dev/null | head -2
echo LISTO
