#!/bin/bash
set -uo pipefail
cd /root/secretaria
DB="$MARIA_DB"

echo "── usuario Santiago Capurro ──"
sqlite3 -header "$DB" "SELECT id, nombre, wa_lid, wa_cus, calendar_id, calendar_acceso FROM usuarios WHERE nombre LIKE '%Santiago Capurro%';"

echo
echo "── eventos relacionados a Santiago Capurro (usuario_id=13) hoy ──"
sqlite3 -separator '|' "$DB" "
  SELECT id, datetime(timestamp,'localtime') as ts, canal, direccion, substr(cuerpo,1,250) as cuerpo
  FROM eventos
  WHERE usuario_id=13 AND date(timestamp,'localtime')='2026-05-26'
  ORDER BY timestamp ASC;
"

echo
echo "── claude_calls / fallos relacionados ──"
sqlite3 -separator '|' "$DB" "
  SELECT datetime(timestamp,'localtime') as ts, canal, direccion, substr(cuerpo,1,250) as cuerpo, substr(coalesce(metadata_json,''),1,200) as meta
  FROM eventos
  WHERE usuario_id=13 AND canal='sistema'
    AND date(timestamp,'localtime')='2026-05-26'
    AND (cuerpo LIKE '%Claude falló%' OR cuerpo LIKE '%claude_call%' OR cuerpo LIKE '%acción%')
  ORDER BY timestamp ASC;
"
