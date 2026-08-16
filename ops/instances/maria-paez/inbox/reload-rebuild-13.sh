#!/bin/bash
cd /root/secretaria
pm2 reload ecosystem.config.js --only maria-paez --update-env >/dev/null 2>&1 && echo "reload OK (mbdiag activo)"
if pgrep -f mb-build-worker >/dev/null; then echo "build corriendo"; else nohup bash /root/mb-build-worker.sh >/dev/null 2>&1 & echo "build v1.3 lanzado"; fi
