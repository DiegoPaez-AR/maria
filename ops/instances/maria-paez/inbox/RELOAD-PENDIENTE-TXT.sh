#!/bin/bash
cd /root/secretaria
pm2 reload ecosystem.config.js --only maria-paez --update-env >/dev/null 2>&1
sleep 6
SEC=$(grep WA_HOOK_SECRET /root/secretaria/config/secrets.conf | cut -d= -f2)
DB="${MARIA_DB:?}"
# reencolar el de prueba si quedó vencido
sqlite3 "$DB" "UPDATE wa_outbox SET estado='pendiente', intentos=0 WHERE id=2;"
echo "== respuesta del endpoint nuevo =="
curl -s -m 10 "https://intensa.io/hooks/wa-maria/$SEC/pendiente.txt"; echo
echo "URL: https://intensa.io/hooks/wa-maria/$SEC/pendiente.txt"
