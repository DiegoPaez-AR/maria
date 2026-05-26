#!/bin/bash
set -uo pipefail
cd /root/secretaria
DB="$MARIA_DB"

echo "── contactos con nombre Pablo / Capurro o whatsapp 5491152570020 ──"
sqlite3 -header "$DB" "
  SELECT c.id, c.usuario_id, u.nombre as libreta_de, c.nombre, c.whatsapp, c.email, c.visibilidad
  FROM contactos c
  LEFT JOIN usuarios u ON u.id = c.usuario_id
  WHERE c.nombre LIKE '%Pablo%' OR c.whatsapp LIKE '%5491152570020%' OR c.whatsapp LIKE '%5257%0020%' OR c.nombre LIKE '%Capurro%'
  ORDER BY c.usuario_id, c.nombre;
"

echo
echo "── pendientes recientes del usuario_id=13 (Santi) con mención a Pablo ──"
sqlite3 -separator '|' "$DB" "
  SELECT id, estado, datetime(creado,'localtime') as creado, dueno, disparador, substr(desc,1,200) as desc
  FROM pendientes
  WHERE usuario_id=13
    AND (desc LIKE '%Pablo%' OR desc LIKE '%almuerzo%' OR desc LIKE '%5257%')
  ORDER BY id DESC LIMIT 5;
"

echo
echo "── últimos sends de Maria a 5491152570020 (los del chat con Pablo) ──"
sqlite3 -separator '|' "$DB" "
  SELECT datetime(timestamp,'localtime') as ts, direccion, usuario_id, substr(cuerpo,1,180) as cuerpo
  FROM eventos
  WHERE canal='whatsapp'
    AND (de='5491152570020@c.us' OR coalesce(metadata_json,'') LIKE '%5491152570020%')
  ORDER BY timestamp ASC;
"
