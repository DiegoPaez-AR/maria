#!/bin/bash
DB="${MARIA_DB:?}"
echo "== cola =="
sqlite3 "$DB" "SELECT id, estado, intentos FROM wa_outbox ORDER BY id DESC LIMIT 2;"
echo "== TODOS los requests recientes al hook (para ver si llega algo de confirmar) =="
grep -h "wa-maria" /var/log/nginx/access.log 2>/dev/null | tail -8 | awk '{print $4, $6, $7, "->", $9}' | sed 's|/hooks/wa-maria/[A-Za-z0-9]*|...|'
