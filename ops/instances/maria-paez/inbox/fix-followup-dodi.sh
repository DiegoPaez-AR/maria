#!/bin/bash
OUT_DIR="$(dirname "$0")/../outbox"; mkdir -p "$OUT_DIR"; OUT="$OUT_DIR/fix-followup-dodi.out"
DB="${MARIA_DB:?}"
{
echo "=== follow_up 23 ANTES ==="
sqlite3 -list -separator ' | ' "$DB" "SELECT id,usuario_id,estado,esperando_de,substr(descripcion,1,50) FROM follow_ups WHERE id=23;"
echo "=== MOVER follow_up 23 a uid=18 (solo si hoy es uid=1 y sigue abierto) ==="
sqlite3 "$DB" "PRAGMA busy_timeout=8000; UPDATE follow_ups SET usuario_id=18 WHERE id=23 AND usuario_id=1;"
echo "update exit=$?"
echo "=== follow_up 23 DESPUES ==="
sqlite3 -list -separator ' | ' "$DB" "SELECT id,usuario_id,estado,esperando_de FROM follow_ups WHERE id=23;"
echo "=== follow_ups abiertos de Gabi (uid=18) ahora — debe incluir a Rodrigo/Dodi ==="
sqlite3 -list -separator ' | ' "$DB" "SELECT id,estado,esperando_de,substr(descripcion,1,45) FROM follow_ups WHERE usuario_id=18 AND estado='abierto';"
echo "=== sanity: ¿queda algún follow_up abierto esperando a Rodrigo bajo uid=1? (deberia vacio) ==="
sqlite3 -list -separator ' | ' "$DB" "SELECT id,usuario_id,estado FROM follow_ups WHERE esperando_de LIKE '%57276026%' AND usuario_id=1 AND estado='abierto';"
} > "$OUT" 2>&1
echo done >> "$OUT"
