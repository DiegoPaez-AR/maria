#!/bin/bash
set -uo pipefail
cd /root/secretaria
DB="$MARIA_DB"

echo "── mensajes salientes WA del bot en últimos 10 min ──"
sqlite3 -separator '|' "$DB" "
  SELECT datetime(timestamp,'localtime') as ts, de, substr(cuerpo,1,250) as cuerpo
  FROM eventos
  WHERE canal='whatsapp' AND direccion='saliente'
    AND datetime(timestamp,'localtime') >= '2026-05-26 11:00'
  ORDER BY timestamp ASC;
"

echo
echo "── acciones ejecutadas en últimos 10 min ──"
sqlite3 -separator '|' "$DB" "
  SELECT datetime(timestamp,'localtime') as ts, substr(cuerpo,1,80) as cuerpo, substr(coalesce(metadata_json,''),1,250) as meta
  FROM eventos
  WHERE canal='sistema' AND direccion='interno'
    AND datetime(timestamp,'localtime') >= '2026-05-26 11:00'
    AND cuerpo LIKE 'acción%'
  ORDER BY timestamp ASC;
"
