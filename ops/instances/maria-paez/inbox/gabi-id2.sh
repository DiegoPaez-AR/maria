#!/bin/bash
OUT_DIR="$(dirname "$0")/../outbox"; mkdir -p "$OUT_DIR"; OUT="$OUT_DIR/gabi-id2.out"
DB="${MARIA_DB:?}"
{
echo "=== Gabi columnas de identidad ==="
sqlite3 -line "$DB" "SELECT id,nombre,wa_lid,wa_cus,email,calendar_acceso,activo FROM usuarios WHERE id=18;"
echo "=== tag usuario_id de sus entrantes de texto ==="
sqlite3 -column -header "$DB" "SELECT id, usuario_id, de FROM eventos WHERE de LIKE '%5491165286555%' AND direccion='entrante' ORDER BY id LIMIT 4;"
echo "=== count eventos vcard de Gabi ==="
sqlite3 "$DB" "SELECT COUNT(*) FROM eventos WHERE usuario_id=18 AND (cuerpo LIKE '%vcard%' OR tipo_original='vcard');"
} > "$OUT" 2>&1
echo "done" >> "$OUT"
