#!/bin/bash
set -uo pipefail
cd /root/secretaria
DB="$MARIA_DB"

echo "── schema notas_contacto ──"
sqlite3 "$DB" ".schema notas_contacto"

echo
echo "── eventos del usuario_id=1 hoy entre 09:00-10:00 (whatsapp/interno/sistema) ──"
sqlite3 -header -separator '|' "$DB" "
  SELECT id, datetime(timestamp,'localtime') as ts, canal, direccion, substr(cuerpo,1,150) as cuerpo, substr(coalesce(metadata_json,''),1,120) as meta
  FROM eventos
  WHERE usuario_id=1
    AND datetime(timestamp,'localtime') >= '2026-05-26 09:00'
    AND datetime(timestamp,'localtime') <  '2026-05-26 10:00'
  ORDER BY timestamp ASC;
"

echo
echo "── eventos con 'Fabio' o '3492580906' (hoy) ──"
sqlite3 -header -separator '|' "$DB" "
  SELECT id, datetime(timestamp,'localtime') as ts, canal, direccion, usuario_id, substr(cuerpo,1,200) as cuerpo
  FROM eventos
  WHERE date(timestamp,'localtime') = '2026-05-26'
    AND (cuerpo LIKE '%Fabio%' OR cuerpo LIKE '%3492580906%' OR cuerpo LIKE '%5491152189302%' OR cuerpo LIKE '%cancelar%' OR cuerpo LIKE '%268%' OR coalesce(metadata_json,'') LIKE '%fabio%')
  ORDER BY timestamp ASC;
"

echo
echo "── notas del contacto Fabio (id=210) ──"
sqlite3 -header -separator '|' "$DB" "SELECT * FROM notas_contacto WHERE contacto_id=210 ORDER BY id DESC LIMIT 10;" 2>/dev/null || echo "(schema diferente, fallback)"

echo
echo "── pre-09:23 — buscar el cancel del 268 ──"
sqlite3 -header -separator '|' "$DB" "
  SELECT id, datetime(timestamp,'localtime') as ts, canal, direccion, usuario_id, substr(cuerpo,1,250) as cuerpo
  FROM eventos
  WHERE date(timestamp,'localtime') = '2026-05-26'
    AND datetime(timestamp,'localtime') < '2026-05-26 09:30'
    AND (cuerpo LIKE '%268%' OR cuerpo LIKE '%cancelar%' OR cuerpo LIKE '%Fabio%')
  ORDER BY timestamp ASC
  LIMIT 30;
"
