#!/bin/bash
set -uo pipefail
cd /root/secretaria
cf=config/instances/maria-paez.conf; set -a; . "$cf"; set +a
DB="$MARIA_DB"

echo "=== usuarios Andres Neuman (duplicados? cuando creados?) ==="
sqlite3 -header -column "$DB" "SELECT id,nombre,rol,activo,wa_cus,email,creado,brief_activo,brief_hora FROM usuarios WHERE nombre LIKE '%Neuman%' OR nombre LIKE '%Andr%';"

echo ""
echo "=== eventos sistema de crear_usuario / alta recientes (ult 2 dias) ==="
sqlite3 "$DB" "SELECT datetime(timestamp,'-3 hours') art, usuario_id, replace(substr(COALESCE(cuerpo,''),1,120),char(10),' / ') t FROM eventos WHERE canal='sistema' AND (cuerpo LIKE '%crear_usuario%' OR cuerpo LIKE '%Neuman%' OR cuerpo LIKE '%alta%') AND timestamp >= '2026-05-28 00:00:00' ORDER BY timestamp;"

echo ""
echo "=== que le pidio Diego (owner, user 1) sobre Andres — ult 2 dias ==="
sqlite3 "$DB" "SELECT datetime(timestamp,'-3 hours') art, direccion, replace(substr(COALESCE(cuerpo,''),1,160),char(10),' / ') t FROM eventos WHERE usuario_id=1 AND canal='whatsapp' AND (cuerpo LIKE '%Neuman%' OR cuerpo LIKE '%Andr%') AND timestamp >= '2026-05-28 00:00:00' ORDER BY timestamp;"

echo ""
echo "=== brief 7am a Andres? (buscar morning-brief en su bucket) ==="
AID=$(sqlite3 "$DB" "SELECT id FROM usuarios WHERE nombre LIKE '%Neuman%' ORDER BY id LIMIT 1;")
echo "Andres user_id=$AID"
sqlite3 "$DB" "SELECT datetime(timestamp,'-3 hours') art, direccion, substr(COALESCE(cuerpo,''),1,80) FROM eventos WHERE usuario_id='$AID' AND canal='whatsapp' ORDER BY timestamp;"
