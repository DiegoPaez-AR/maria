#!/bin/bash
cd /root/secretaria
pm2 reload ecosystem.config.js --only maria-paez --update-env >/dev/null 2>&1
sleep 6
SEC=$(grep WA_HOOK_SECRET /root/secretaria/config/secrets.conf | cut -d= -f2)
echo "== confirmando el #7 a mano (el que ya salió) =="
curl -s -m 10 "https://intensa.io/hooks/wa-maria/$SEC/confirmar/7"; echo
DB="${MARIA_DB:?}"
sqlite3 "$DB" "SELECT id, estado, COALESCE(entregado,'-') FROM wa_outbox ORDER BY id DESC LIMIT 2;"
