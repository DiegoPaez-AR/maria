#!/bin/bash
set -uo pipefail
cd /root/secretaria
DB="$MARIA_DB"

echo "── conversación Maria ↔ Santi Capurro hoy ──"
echo "(matches: usuario_id=13, o de/destino contiene su LID o c.us)"
sqlite3 -separator '|' "$DB" "
  SELECT id, datetime(timestamp,'localtime') as ts, canal, direccion, usuario_id, substr(coalesce(de,''),1,30) as de, substr(cuerpo,1,400) as cuerpo
  FROM eventos
  WHERE date(timestamp,'localtime')='2026-05-26'
    AND (
      usuario_id=13
      OR de='134076010885285@lid' OR de='5491166010010@c.us'
      OR (canal='whatsapp' AND nombre LIKE '%Santi%Capurro%')
      OR (metadata_json LIKE '%134076010885285%')
      OR (metadata_json LIKE '%5491166010010%')
    )
  ORDER BY timestamp ASC;
"
