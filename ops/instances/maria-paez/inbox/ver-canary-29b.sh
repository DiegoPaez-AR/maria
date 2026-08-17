#!/bin/bash
grep -i "canary" /root/secretaria/ops/.cron.log | tail -2
ls /root/secretaria/state/.canary-bad-commit 2>/dev/null && echo "marker sigue" || echo "marker limpio"
grep "versionName" /root/secretaria/ops/mariabridge/app/build.gradle | head -1
if ! pgrep -f mb-build-worker >/dev/null; then nohup bash /root/mb-build-worker.sh >/dev/null 2>&1 & echo "build v2.9 lanzado"; else echo "build corriendo"; fi
echo LISTO
