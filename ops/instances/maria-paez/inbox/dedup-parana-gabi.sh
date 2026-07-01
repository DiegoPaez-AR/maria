#!/bin/bash
OUT_DIR="$(dirname "$0")/../outbox"; mkdir -p "$OUT_DIR"; OUT="$OUT_DIR/dedup-parana-gabi.out"
DB="${MARIA_DB:?}"
{
echo "=== duplicados Parana en libreta de Gabi ANTES ==="
sqlite3 -column -header "$DB" "SELECT id,nombre,whatsapp FROM contactos WHERE usuario_id=18 ORDER BY id;"
echo "=== borrar los sin-acento 344,345 (quedan 342/343 con acento + 340 Ana Clara) ==="
sqlite3 "$DB" "PRAGMA busy_timeout=8000; DELETE FROM contactos WHERE id IN (344,345) AND usuario_id=18 AND nombre LIKE 'Parana%';"
echo "exit=$?"
echo "=== libreta de Gabi FINAL ==="
sqlite3 -column -header "$DB" "SELECT id,nombre,whatsapp,email FROM contactos WHERE usuario_id=18 ORDER BY id;"
} > "$OUT" 2>&1
echo done >> "$OUT"
