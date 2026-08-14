#!/bin/bash
DB="${MARIA_DB:?}"
echo "== cola =="
sqlite3 "$DB" "SELECT id, estado, intentos, COALESCE(tomado_en,'-'), COALESCE(entregado,'-') FROM wa_outbox ORDER BY id DESC LIMIT 3;"
echo "== ultimos requests del telefono (hora -03) =="
tail -400 /var/log/nginx/intensa.io.access.log 2>/dev/null | grep "wa-maria" | tail -8 | awk '{print $4, $7, "->", $9}' | sed 's|/hooks/wa-maria/[A-Za-z0-9]*|...|'
