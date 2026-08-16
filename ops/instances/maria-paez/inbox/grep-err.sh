#!/bin/bash
pgrep -f mb-build-worker >/dev/null && echo "aún corriendo" || echo "terminó"
grep -E "^e: file://|error:|Unresolved reference|APK_OK|APK_FAIL" /root/mariabridge-build.log | head -25
echo LISTO
