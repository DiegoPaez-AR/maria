#!/bin/bash
DB="${MARIA_DB:?falta MARIA_DB}"
echo "== eventos autoresponder última hora =="
sqlite3 "$DB" "SELECT timestamp, direccion, COALESCE(de,''), substr(cuerpo,1,60) FROM eventos WHERE metadata_json LIKE '%autoresponder%' AND timestamp > datetime('now','-1 hour') ORDER BY id DESC LIMIT 8;"
echo "== desconocidos/ambiguos wa-hook =="
sqlite3 "$DB" "SELECT timestamp, substr(cuerpo,1,80) FROM eventos WHERE metadata_json LIKE '%wa_hook%' AND timestamp > datetime('now','-1 hour') ORDER BY id DESC LIMIT 5;"
echo "== nginx (todos los logs) =="
grep -h "wa-maria" /var/log/nginx/*.log 2>/dev/null | tail -4 | awk '{print $4, $7, "->", $9}' | sed 's|/hooks/wa-maria/[A-Za-z0-9]*|.../***|'
