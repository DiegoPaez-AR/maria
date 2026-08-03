#!/bin/bash
DB="${MARIA_DB:?falta MARIA_DB}"
echo "== eventos autoresponder (2h) =="
sqlite3 "$DB" "SELECT timestamp, direccion, COALESCE(de,''), substr(cuerpo,1,60) FROM eventos WHERE metadata_json LIKE '%autoresponder%' AND timestamp > datetime('now','-2 hours') ORDER BY id DESC LIMIT 8;"
echo "== wa_hook desconocidos/ambiguos (2h) =="
sqlite3 "$DB" "SELECT timestamp, substr(cuerpo,1,80) FROM eventos WHERE metadata_json LIKE '%wa_hook%' AND timestamp > datetime('now','-2 hours') ORDER BY id DESC LIMIT 5;"
echo "== nginx =="
grep -h "wa-maria" /var/log/nginx/*.log 2>/dev/null | tail -5 | awk '{print $4, $7, "->", $9}' | sed 's|/hooks/wa-maria/[A-Za-z0-9]*|.../***|'
