#!/bin/bash
# Build MariaBridge 4.13 (aprobado Diego 30/10) — sincrónico con tope, el build tarda ~40s
cd /root/secretaria; grep -E "versionCode|versionName" ops/mariabridge/app/build.gradle
timeout 240 bash /root/mb-build-worker.sh < /dev/null > /root/mariabridge-build.log 2>&1; echo "exit=$?"
grep -E "error:|e: |BUILD|APK_OK" /root/mariabridge-build.log | tail -8; cat /var/www/intensa.io/_dl/mariabridge-latest.json
