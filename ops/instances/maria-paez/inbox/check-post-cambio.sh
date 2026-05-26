#!/bin/bash
set -uo pipefail
cd /root/secretaria
DB="$MARIA_DB"

echo "── eventos del usuario_id=1 desde las 11:00 (todo, entrante+saliente+interno) ──"
sqlite3 -separator '|' "$DB" "
  SELECT datetime(timestamp,'localtime') as ts, canal, direccion, substr(cuerpo,1,250) as cuerpo
  FROM eventos
  WHERE usuario_id=1 AND datetime(timestamp,'localtime') >= '2026-05-26 11:00'
  ORDER BY timestamp ASC;
"

echo
echo "── usuarios activos: ¿quiénes tienen calendar configurado vs no? ──"
sqlite3 -header -column "$DB" "
  SELECT id, nombre, calendar_id, calendar_acceso, wa_lid, wa_cus
  FROM usuarios
  WHERE activo=1
  ORDER BY id;
" 2>/dev/null || sqlite3 -header -column "$DB" "
  SELECT id, nombre, calendar_id, wa_cus
  FROM usuarios
  ORDER BY id;
"
