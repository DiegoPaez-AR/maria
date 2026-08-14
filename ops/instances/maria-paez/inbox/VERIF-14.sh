#!/bin/bash
DB="${MARIA_DB:?}"
echo "== cola =="
sqlite3 "$DB" "SELECT id, estado, intentos, COALESCE(entregado,'-') FROM wa_outbox ORDER BY id DESC LIMIT 3;"
echo "== evento saliente =="
sqlite3 "$DB" "SELECT timestamp, substr(cuerpo,1,45) FROM eventos WHERE metadata_json LIKE '%tasker_outbox%' ORDER BY id DESC LIMIT 3;"
echo "== requests =="
tail -300 /var/log/nginx/intensa.io.access.log 2>/dev/null | grep "wa-maria" | tail -5 | awk '{print $4, $7, "->", $9}' | sed 's|/hooks/wa-maria/[A-Za-z0-9]*|...|'
