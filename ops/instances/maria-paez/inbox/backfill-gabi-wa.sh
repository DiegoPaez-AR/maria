#!/bin/bash
OUT_DIR="$(dirname "$0")/../outbox"; mkdir -p "$OUT_DIR"; OUT="$OUT_DIR/backfill-gabi-wa.out"
DB="${MARIA_DB:?}"
WA='5491165286555@c.us'
{
echo "=== colision (otro usuario con ese wa_cus)? ==="
sqlite3 "$DB" "SELECT id,nombre FROM usuarios WHERE wa_cus='$WA';"
echo "=== antes ==="
sqlite3 "$DB" "SELECT id,nombre,wa_lid,wa_cus FROM usuarios WHERE id=18;"
echo "=== UPDATE (solo si esta vacio) ==="
sqlite3 "$DB" "PRAGMA busy_timeout=8000; UPDATE usuarios SET wa_cus='$WA', actualizado=CURRENT_TIMESTAMP WHERE id=18 AND (wa_cus IS NULL OR wa_cus='');"
echo "exit=$?"
echo "=== despues ==="
sqlite3 "$DB" "SELECT id,nombre,wa_lid,wa_cus FROM usuarios WHERE id=18;"
echo "=== resolucion (simula qPorWaCus) → debe devolver a Gabi id=18 ==="
sqlite3 "$DB" "SELECT id,nombre FROM usuarios WHERE wa_cus='$WA' AND activo=1;"
} > "$OUT" 2>&1
echo done >> "$OUT"
