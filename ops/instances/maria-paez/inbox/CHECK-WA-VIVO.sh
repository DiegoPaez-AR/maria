#!/bin/bash
DB="${MARIA_DB:?falta MARIA_DB}"
echo "== eventos WhatsApp últimas 2h =="
sqlite3 "$DB" "SELECT timestamp, direccion, COALESCE(nombre,de), substr(cuerpo,1,45) FROM eventos WHERE canal='whatsapp' AND timestamp > datetime('now','-2 hours') ORDER BY id DESC LIMIT 8;"
echo "== requests al hook (últimos) =="
grep -h "wa-maria" /var/log/nginx/access.log 2>/dev/null | tail -6 | awk '{print $4, $7, "->", $9}' | sed 's|/hooks/wa-maria/[A-Za-z0-9]*|...|'
