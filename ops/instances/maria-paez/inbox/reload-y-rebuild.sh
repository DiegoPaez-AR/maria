#!/bin/bash
cd /root/secretaria
echo "── reload Maria (pendiente.txt con nombre) ──"
pm2 reload ecosystem.config.js --only maria-paez --update-env >/dev/null 2>&1 && echo "reload OK"
echo "── recompilar APK v1.1 en background ──"
if pgrep -f mb-build-worker >/dev/null; then echo "build ya corriendo"; else
  nohup bash /root/mb-build-worker.sh >/dev/null 2>&1 &
  echo "build lanzado (pid $!)"
fi
