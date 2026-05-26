#!/bin/bash
set -uo pipefail
cd /root/secretaria
DB="$MARIA_DB"

echo "── contacto Fabio (id=210) — estado actual ──"
sqlite3 -header -column "$DB" "SELECT id, nombre, whatsapp, datetime(actualizado,'localtime') as actualizado FROM contactos WHERE id=210;"

echo
echo "── últimos eventos del usuario_id=1 (Diego) — buscando upsert_contacto reciente ──"
sqlite3 -separator '|' "$DB" "
  SELECT datetime(timestamp,'localtime') as ts, canal, direccion, substr(cuerpo,1,180) as cuerpo
  FROM eventos
  WHERE usuario_id=1
    AND datetime(timestamp,'localtime') >= '2026-05-26 10:30'
  ORDER BY timestamp DESC
  LIMIT 15;
"
