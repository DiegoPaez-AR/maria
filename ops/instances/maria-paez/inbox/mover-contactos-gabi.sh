#!/bin/bash
OUT_DIR="$(dirname "$0")/../outbox"; mkdir -p "$OUT_DIR"; OUT="$OUT_DIR/mover-contactos-gabi.out"
DB="${MARIA_DB:?}"
{
echo "=== contactos actuales de Gabi (uid=18) ANTES ==="
sqlite3 -column -header "$DB" "SELECT id,nombre,whatsapp,email FROM contactos WHERE usuario_id=18;"
echo
echo "=== los 3 a mover (confirmar nombre antes) ==="
sqlite3 -column -header "$DB" "SELECT id,usuario_id,nombre,whatsapp FROM contactos WHERE id IN (340,342,343);"
echo
echo "=== otros posibles de Gabi en tu libreta (Dodi/Rodrigo o creados en su ventana owner) ==="
sqlite3 -column -header "$DB" "SELECT id,nombre,whatsapp,datetime(creado,'localtime') creado FROM contactos WHERE usuario_id=1 AND (nombre LIKE '%Dodi%' OR nombre LIKE '%Rodrigo%' OR whatsapp LIKE '%5727-6026%' OR whatsapp LIKE '%57276026%');"
echo
echo "=== MOVER 340,342,343 -> uid=18 (solo si hoy son de uid=1) ==="
sqlite3 "$DB" "PRAGMA busy_timeout=8000; UPDATE contactos SET usuario_id=18, actualizado=CURRENT_TIMESTAMP WHERE id IN (340,342,343) AND usuario_id=1;"
echo "exit_update=$?"
echo
echo "=== DESPUES: libreta de Gabi ==="
sqlite3 -column -header "$DB" "SELECT id,nombre,whatsapp,email FROM contactos WHERE usuario_id=18 ORDER BY id;"
echo "=== quedan esos ids bajo uid=1? (debe ser vacio) ==="
sqlite3 -column -header "$DB" "SELECT id,usuario_id,nombre FROM contactos WHERE id IN (340,342,343) AND usuario_id=1;"
} > "$OUT" 2>&1
echo done >> "$OUT"
