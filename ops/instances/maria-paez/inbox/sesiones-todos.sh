#!/bin/bash
cd /root/secretaria
CF=$(ls config/instances/*.conf | head -1)
sed -i 's/^MARIA_SESIONES_USUARIOS=.*/MARIA_SESIONES_USUARIOS=/' "$CF"
grep -E '^MARIA_SESION' "$CF"
timeout 60 pm2 reload ecosystem.config.js --only maria-paez --update-env >/dev/null 2>&1 && echo "reload OK — sesiones para TODOS los usuarios"
echo LISTO
