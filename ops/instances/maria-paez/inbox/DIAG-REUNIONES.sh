#!/bin/bash
DB="${MARIA_DB:?}"
echo "== cola completa (últimos) =="
sqlite3 "$DB" "SELECT id, estado, intentos, numero, COALESCE(tomado_en,'-'), COALESCE(entregado,'-'), substr(texto,1,40) FROM wa_outbox ORDER BY id DESC LIMIT 6;"
echo "== polls del teléfono (últimos, hora -03) =="
tail -400 /var/log/nginx/intensa.io.access.log 2>/dev/null | grep "wa-maria" | tail -10 | awk '{print $4, $7, "->", $9}' | sed 's|/hooks/wa-maria/[A-Za-z0-9]*|...|'
echo "== eventos recientes (2h) =="
sqlite3 "$DB" "SELECT timestamp, canal, direccion, COALESCE(nombre,de), substr(cuerpo,1,45) FROM eventos WHERE timestamp > datetime('now','-2 hours') AND canal IN ('whatsapp','telegram','gmail') ORDER BY id DESC LIMIT 12;"
