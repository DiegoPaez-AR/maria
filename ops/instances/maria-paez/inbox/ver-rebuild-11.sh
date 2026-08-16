#!/bin/bash
pgrep -f mb-build-worker >/dev/null && echo "compilando…" || echo "terminó"
grep -E "APK_OK|APK_FAIL|^e: file|BUILD FAILED|BUILD SUCCESSFUL" /root/mariabridge-build.log | head -10
echo LISTO
