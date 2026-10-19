#!/bin/bash
# Build MariaBridge 4.12 (aprobado Diego 19/10) — el worker publica latest.json
cd /root/secretaria; grep -E "versionCode|versionName" ops/mariabridge/app/build.gradle
setsid bash /root/mb-build-worker.sh < /dev/null > /root/mariabridge-build.log 2>&1 &
echo "lanzado $!"
