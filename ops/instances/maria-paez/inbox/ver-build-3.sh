#!/bin/bash
pgrep -f mb-build-worker >/dev/null && echo "aún corriendo" || echo "terminó"
grep -E "^e: file|error:|Unresolved|APK_OK|APK_FAIL|BUILD SUCCESSFUL|BUILD FAILED" /root/mariabridge-build.log | head -20
echo LISTO
