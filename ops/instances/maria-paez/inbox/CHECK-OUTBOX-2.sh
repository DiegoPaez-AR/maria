#!/bin/bash
DB="${MARIA_DB:?falta MARIA_DB}"
echo "== estado de la cola =="
sqlite3 "$DB" "SELECT id, estado, intentos, substr(texto,1,35), COALESCE(tomado_en,'-'), COALESCE(entregado,'-') FROM wa_outbox ORDER BY id DESC LIMIT 5;"
echo "== requests del teléfono (nginx, últimos) =="
grep -h "wa-maria" /var/log/nginx/access.log 2>/dev/null | tail -6 | awk '{print $4, $6, $7, "->", $9}' | sed 's|/hooks/wa-maria/[A-Za-z0-9]*|...|'
