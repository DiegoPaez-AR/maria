#!/bin/bash
set -uo pipefail
cd /root/secretaria
DB="$MARIA_DB"

echo "── eventos del usuario_id=1 desde las 11:09 — TODO ──"
sqlite3 -separator '|' "$DB" "
  SELECT id, datetime(timestamp,'localtime') as ts, canal, direccion, substr(cuerpo,1,200) as cuerpo
  FROM eventos
  WHERE usuario_id=1 AND datetime(timestamp,'localtime') >= '2026-05-26 11:09'
  ORDER BY timestamp ASC;
"

echo
echo "── acciones ejecutadas + sus metadata completos (post 11:09) ──"
sqlite3 -separator '|' "$DB" "
  SELECT datetime(timestamp,'localtime') as ts, substr(cuerpo,1,60) as cuerpo, substr(coalesce(metadata_json,''),1,500) as meta
  FROM eventos
  WHERE usuario_id=1
    AND canal='sistema' AND direccion='interno'
    AND cuerpo LIKE 'acción%'
    AND datetime(timestamp,'localtime') >= '2026-05-26 11:09'
  ORDER BY timestamp ASC;
"

echo
echo "── contacto Ignacio Garcia ──"
sqlite3 -header "$DB" "
  SELECT id, usuario_id, nombre, whatsapp, email
  FROM contactos
  WHERE nombre LIKE '%Ignacio%' OR nombre LIKE '%Garcia%'
  ORDER BY id;
"
