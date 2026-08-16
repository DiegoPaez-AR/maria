#!/bin/bash
cd /root/secretaria
# deadline del hook a 60s (la app v2.4 banca 90s)
if ! grep -q "^WA_HOOK_DEADLINE_MS=" config/instances/maria-paez.conf; then
  echo "" >> config/instances/maria-paez.conf
  echo "# Deadline de respuesta inline del hook (2026-08-16: MariaBridge v2.4 banca 90s)" >> config/instances/maria-paez.conf
  echo "WA_HOOK_DEADLINE_MS=60000" >> config/instances/maria-paez.conf
  echo "deadline 60s agregado al conf"
else
  sed -i 's/^WA_HOOK_DEADLINE_MS=.*/WA_HOOK_DEADLINE_MS=60000/' config/instances/maria-paez.conf
  echo "deadline actualizado a 60s"
fi
pm2 reload ecosystem.config.js --only maria-paez --update-env >/dev/null 2>&1 && echo "reload OK"
if pgrep -f mb-build-worker >/dev/null; then echo "build corriendo"; else nohup bash /root/mb-build-worker.sh >/dev/null 2>&1 & echo "build v2.4 lanzado"; fi
echo LISTO
