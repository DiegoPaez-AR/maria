#!/bin/bash
DB="${MARIA_DB:?falta MARIA_DB}"
echo "== cola =="
sqlite3 "$DB" "SELECT id, estado, intentos, substr(texto,1,30), COALESCE(tomado_en,'-') FROM wa_outbox ORDER BY id DESC LIMIT 5;"
echo "== requests del telefono =="
grep -h "wa-maria" /var/log/nginx/access.log 2>/dev/null | tail -6 | awk '{print $4, $7, "->", $9}' | sed 's|/hooks/wa-maria/[A-Za-z0-9]*|...|'
