#!/bin/bash
pgrep -f mb-build-worker >/dev/null && echo "compilando…" || echo terminó
grep -E "APK_OK|APK_FAIL|BUILD (SUCCESSFUL|FAILED)|^e: file" /root/mariabridge-build.log | tail -5
echo LISTO
