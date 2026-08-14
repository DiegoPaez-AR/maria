#!/bin/bash
DB="${MARIA_DB:?}"
echo "== cola =="
sqlite3 "$DB" "SELECT id, estado, intentos, COALESCE(entregado,'-') FROM wa_outbox ORDER BY id DESC LIMIT 3;"
echo "== requests (log correcto de intensa.io) =="
tail -200 /var/log/nginx/intensa.io.access.log 2>/dev/null | grep "wa-maria" | tail -8 | awk '{print $4, $6, $7, "->", $9}' | sed 's|/hooks/wa-maria/[A-Za-z0-9]*|...|'
