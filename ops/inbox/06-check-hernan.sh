#!/bin/bash
# Chequear si Hernan fue creado como usuario, y ver los últimos eventos
# relacionados (acciones del executor, mensajes WA, etc.)

set -u
DB=/root/secretaria/db/maria.sqlite

echo "=== usuarios ==="
sqlite3 -header -column "$DB" "SELECT id, nombre, rol, wa_cus, wa_lid, email, calendar_id, tz, brief_hora, activo, creado FROM usuarios ORDER BY id;"

echo
echo "=== últimos 40 eventos (todos los canales) ==="
sqlite3 -header -column "$DB" "SELECT id, timestamp, usuario_id, canal, direccion, substr(de,1,25) AS de, substr(nombre,1,20) AS nombre, substr(cuerpo,1,70) AS cuerpo FROM eventos ORDER BY id DESC LIMIT 40;"

echo
echo "=== eventos con 'hernan' (case-insensitive) ==="
sqlite3 -header -column "$DB" "SELECT id, timestamp, usuario_id, canal, direccion, substr(de,1,25) AS de, substr(nombre,1,20) AS nombre, substr(cuerpo,1,100) AS cuerpo FROM eventos WHERE LOWER(cuerpo) LIKE '%hernan%' OR LOWER(cuerpo) LIKE '%hernán%' OR LOWER(nombre) LIKE '%hernan%' ORDER BY id DESC LIMIT 30;"

echo
echo "=== acciones del executor (canal=sistema, direccion=interno, cuerpo LIKE 'acción ejecutada%' OR 'acción FALLÓ%') últimas 30 ==="
sqlite3 -header -column "$DB" "SELECT id, timestamp, usuario_id, substr(cuerpo,1,60) AS cuerpo, substr(metadata_json,1,120) AS meta FROM eventos WHERE canal='sistema' AND (cuerpo LIKE 'acción%' OR cuerpo LIKE 'crear_usuario%') ORDER BY id DESC LIMIT 30;"

echo
echo "=== últimos 80 logs pm2 (sin color) ==="
pm2 logs maria --lines 80 --nostream 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | tail -80
