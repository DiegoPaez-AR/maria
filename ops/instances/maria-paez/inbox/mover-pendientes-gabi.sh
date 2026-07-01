#!/bin/bash
OUT_DIR="$(dirname "$0")/../outbox"; mkdir -p "$OUT_DIR"; OUT="$OUT_DIR/mover-pendientes-gabi.out"
DB="${MARIA_DB:?}"
{
echo "=== confirmar los 3 antes de mover (deben ser de Gabi, uid=1) ==="
sqlite3 -column -header "$DB" "SELECT id,usuario_id,substr(desc,1,80) FROM pendientes WHERE id IN (204,205,208);"
echo "=== MOVER 204,205,208 -> uid=18 (solo si hoy son de uid=1) ==="
sqlite3 "$DB" "PRAGMA busy_timeout=8000; UPDATE pendientes SET usuario_id=18 WHERE id IN (204,205,208) AND usuario_id=1;"
echo "update exit=$?"
echo "=== DESPUES: pendientes abiertos de Gabi (uid=18) ==="
sqlite3 -column -header "$DB" "SELECT id,substr(desc,1,80) FROM pendientes WHERE usuario_id=18 AND estado='abierto' ORDER BY id;"
echo "=== quedan 204/205/208 bajo uid=1? (debe ser vacio) ==="
sqlite3 -column -header "$DB" "SELECT id,usuario_id FROM pendientes WHERE id IN (204,205,208) AND usuario_id=1;"
echo "=== tus pendientes (uid=1) que quedan ==="
sqlite3 -column -header "$DB" "SELECT id,substr(desc,1,50) FROM pendientes WHERE usuario_id=1 AND estado='abierto' ORDER BY id;"
} > "$OUT" 2>&1
echo done >> "$OUT"
