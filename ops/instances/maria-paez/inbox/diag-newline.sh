#!/bin/bash
OUT_DIR="$(dirname "$0")/../outbox"; mkdir -p "$OUT_DIR"; OUT="$OUT_DIR/diag-newline.out"
DB="${MARIA_DB:?}"
{
echo "=== mensajes salientes recientes con \\n literal (backslash-n) en el cuerpo ==="
sqlite3 -list -separator ' | ' "$DB" "SELECT id, datetime(timestamp,'localtime'), substr(de,1,16), substr(cuerpo,1,140) FROM eventos WHERE canal='whatsapp' AND direccion='saliente' AND cuerpo LIKE '%\\n%' ESCAPE '\\' AND datetime(timestamp,'localtime')>='2026-07-01 14:09:00' ORDER BY id DESC LIMIT 8;"
echo
echo "=== el pedido a Barra Chalaca: cuerpo crudo (ver si el \\n es literal) ==="
sqlite3 "$DB" "SELECT quote(cuerpo) FROM eventos WHERE canal='whatsapp' AND direccion='saliente' AND cuerpo LIKE '%Tequeños%' ORDER BY id DESC LIMIT 1;" | head -c 400; echo
echo
echo "=== cuántos salientes con \\n literal ANTES vs DESPUÉS del flip MCP (14:09) ==="
echo -n "antes (pre-MCP, hoy): "; sqlite3 "$DB" "SELECT COUNT(*) FROM eventos WHERE canal='whatsapp' AND direccion='saliente' AND cuerpo LIKE '%\\n%' ESCAPE '\\' AND datetime(timestamp,'localtime')>='2026-07-01 00:00:00' AND datetime(timestamp,'localtime')<'2026-07-01 14:09:00';"
echo -n "despues (MCP): "; sqlite3 "$DB" "SELECT COUNT(*) FROM eventos WHERE canal='whatsapp' AND direccion='saliente' AND cuerpo LIKE '%\\n%' ESCAPE '\\' AND datetime(timestamp,'localtime')>='2026-07-01 14:09:00';"
} > "$OUT" 2>&1
echo done >> "$OUT"
