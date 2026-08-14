#!/bin/bash
DB="${MARIA_DB:?}"
echo "== cola =="
sqlite3 "$DB" "SELECT id, estado, intentos, COALESCE(entregado,'-') FROM wa_outbox ORDER BY id DESC LIMIT 3;"
echo "== requests confirmar =="
grep -h "confirmar" /var/log/nginx/access.log 2>/dev/null | tail -3 | awk '{print $4, $7, "->", $9}' | sed 's|/hooks/wa-maria/[A-Za-z0-9]*|...|'
echo "== evento registrado =="
sqlite3 "$DB" "SELECT timestamp, substr(cuerpo,1,40) FROM eventos WHERE metadata_json LIKE '%tasker_outbox%' ORDER BY id DESC LIMIT 2;"
