#!/bin/bash
# Dump conversacion de anoche (2026-05-28) — Diego <-> Maria y Maria <-> Poch Burgers.
# Objetivo: reconstruir el incidente Poch (loop de confirmacion no cerrado + tz UTC).
set -uo pipefail
cf=/root/secretaria/config/instances/maria-paez.conf
set -a; . "$cf"; set +a
DB="$MARIA_DB"

echo "=== Contacto Poch ==="
sqlite3 -header -column "$DB" "SELECT id, usuario_id, nombre, wa, COALESCE(email,'') FROM contactos WHERE nombre LIKE '%Poch%' OR wa LIKE '%37646922%';" 2>&1

echo ""
echo "=== Conversacion COMPLETA 2026-05-28 (desde 22:00 UTC = 19:00 ART) hasta ahora ==="
echo "    (hora mostrada en ART; jid 1132317896=Diego owner, 137646922=Poch)"
echo ""
sqlite3 "$DB" "
SELECT datetime(timestamp,'-3 hours') AS art,
       direccion,
       CASE
         WHEN de LIKE '%1132317896%' THEN 'Diego'
         WHEN de LIKE '%37646922%'   THEN 'POCH'
         WHEN de LIKE '%34342575317160%' THEN 'Diego(lid)'
         ELSE COALESCE(nombre, de) END AS quien,
       COALESCE(json_extract(metadata_json,'\$.slot'),'') AS slot,
       replace(COALESCE(cuerpo,''), char(10), ' / ') AS texto
FROM eventos
WHERE canal='whatsapp'
  AND timestamp >= '2026-05-28 22:00:00'
  AND (de LIKE '%1132317896%' OR de LIKE '%37646922%' OR de LIKE '%34342575317160%')
ORDER BY timestamp;
" 2>&1

echo ""
echo "=== Acciones/envios salientes hacia POCH (137646922) en la noche ==="
sqlite3 -header -column "$DB" "
SELECT datetime(timestamp,'-3 hours') AS art, direccion, substr(COALESCE(cuerpo,''),1,120) AS texto
FROM eventos
WHERE de LIKE '%37646922%'
ORDER BY timestamp DESC LIMIT 20;
" 2>&1

echo ""
echo "=== Tareas/pendientes creados que mencionen Poch o hamburguesas ==="
sqlite3 -header -column "$DB" "SELECT id, estado, date(creado) c, dueno, desc FROM pendientes WHERE desc LIKE '%Poch%' OR desc LIKE '%hambur%' OR desc LIKE '%pedido%';" 2>&1
