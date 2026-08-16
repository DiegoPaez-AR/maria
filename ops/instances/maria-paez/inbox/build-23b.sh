#!/bin/bash
grep "versionName\|versionCode" /root/secretaria/ops/mariabridge/app/build.gradle | head -2
if pgrep -f mb-build-worker >/dev/null; then echo corriendo; exit 0; fi
nohup bash /root/mb-build-worker.sh >/dev/null 2>&1 &
echo "build 23b lanzado"
