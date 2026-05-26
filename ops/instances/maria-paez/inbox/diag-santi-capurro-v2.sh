#!/bin/bash
set -uo pipefail
cd /root/secretaria
DB="$MARIA_DB"

echo "── entradas desde el LID de Santi Capurro (134076010885285) ──"
sqlite3 -separator '|' "$DB" "
  SELECT id, datetime(timestamp,'localtime') as ts, canal, direccion, usuario_id, substr(cuerpo,1,250) as cuerpo
  FROM eventos
  WHERE (de='134076010885285@lid' OR de LIKE '%134076010885285%')
    AND date(timestamp,'localtime')='2026-05-26'
  ORDER BY timestamp ASC;
"

echo
echo "── últimos 30 eventos del 26-05 post-11:00 (todos los usuarios, para encontrar fallos) ──"
sqlite3 -separator '|' "$DB" "
  SELECT id, datetime(timestamp,'localtime') as ts, canal, direccion, usuario_id, substr(cuerpo,1,200) as cuerpo
  FROM eventos
  WHERE date(timestamp,'localtime')='2026-05-26'
    AND datetime(timestamp,'localtime') >= '2026-05-26 12:30'
    AND (cuerpo LIKE '%Capurro%' OR cuerpo LIKE '%capurro%' OR cuerpo LIKE '%Santiago%' OR cuerpo LIKE '%santi%' OR cuerpo LIKE '%134076010885285%')
  ORDER BY timestamp ASC
  LIMIT 50;
"

echo
echo "── últimos claude_call fallidos hoy ──"
sqlite3 -separator '|' "$DB" "
  SELECT id, datetime(timestamp,'localtime') as ts, usuario_id, substr(cuerpo,1,250) as cuerpo
  FROM eventos
  WHERE date(timestamp,'localtime')='2026-05-26'
    AND (cuerpo LIKE '%Claude falló%' OR cuerpo LIKE '%ERROR=%')
  ORDER BY timestamp DESC LIMIT 20;
"
