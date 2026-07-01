#!/bin/bash
OUT_DIR="$(dirname "$0")/../outbox"; mkdir -p "$OUT_DIR"; OUT="$OUT_DIR/cerrar-205.out"
DB="${MARIA_DB:?}"
{
echo "=== 205 antes ==="
sqlite3 -column -header "$DB" "SELECT id,usuario_id,estado,substr(desc,1,70) FROM pendientes WHERE id=205;"
echo "=== cerrar 205 (ya se comunicaron) ==="
sqlite3 "$DB" "PRAGMA busy_timeout=8000; UPDATE pendientes SET estado='cancelado', cerrado=CURRENT_TIMESTAMP WHERE id=205;"
echo "exit=$?"
echo "=== pendientes ABIERTOS de Gabi (uid=18) que quedan ==="
sqlite3 -column -header "$DB" "SELECT id,substr(desc,1,80) FROM pendientes WHERE usuario_id=18 AND estado='abierto' ORDER BY id;"
} > "$OUT" 2>&1
echo done >> "$OUT"
