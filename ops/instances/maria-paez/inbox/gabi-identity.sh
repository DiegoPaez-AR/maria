#!/bin/bash
OUT_DIR="$(dirname "$0")/../outbox"; mkdir -p "$OUT_DIR"; OUT="$OUT_DIR/gabi-identity.out"
DB="${MARIA_DB:?}"
{
echo "=== Gabi TODAS las columnas de identidad ==="
sqlite3 -line "$DB" "SELECT id,nombre,wa_lid,wa_cus,email,calendar_acceso,activo FROM usuarios WHERE id=18;"
echo "=== cómo quedaron tagueados sus mensajes entrantes de texto (usuario_id) ==="
sqlite3 -column -header "$DB" "SELECT id, usuario_id, de, substr(cuerpo,1,30) FROM eventos WHERE de LIKE '%5491165286555%' AND direccion='entrante' ORDER BY id LIMIT 5;"
echo "=== hay algún evento vcard de Gabi? ==="
sqlite3 "$DB" "SELECT COUNT(*) FROM eventos WHERE usuario_id=18 AND (cuerpo LIKE '%vcard%' OR tipo_original='vcard');"
