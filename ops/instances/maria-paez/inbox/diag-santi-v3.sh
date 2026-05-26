#!/bin/bash
set -uo pipefail
cd /root/secretaria
DB="$MARIA_DB"

echo "── gmail entrantes hoy con remitente Santiago/capurro ──"
sqlite3 -separator '|' "$DB" "
  SELECT id, datetime(timestamp,'localtime') as ts, usuario_id, de, substr(coalesce(asunto,''),1,80) as asunto, substr(cuerpo,1,150) as cuerpo
  FROM eventos
  WHERE canal='gmail' AND direccion='entrante'
    AND date(timestamp,'localtime')='2026-05-26'
    AND (de LIKE '%capurro%' OR de LIKE '%santiago%' OR cuerpo LIKE '%santiago capurro%' OR cuerpo LIKE '%Santiago Capurro%')
  ORDER BY timestamp ASC;
"

echo
echo "── WA entrantes hoy donde el cuerpo menciona calendar/compart/cambi/listo ──"
sqlite3 -separator '|' "$DB" "
  SELECT id, datetime(timestamp,'localtime') as ts, usuario_id, de, nombre, substr(cuerpo,1,200) as cuerpo
  FROM eventos
  WHERE canal='whatsapp' AND direccion='entrante'
    AND date(timestamp,'localtime')='2026-05-26'
    AND datetime(timestamp,'localtime') >= '2026-05-26 11:00'
    AND (cuerpo LIKE '%calendar%' OR cuerpo LIKE '%compart%' OR cuerpo LIKE '%cambié%' OR cuerpo LIKE '%cambie%' OR cuerpo LIKE '%listo%' OR cuerpo LIKE '%agenda%')
  ORDER BY timestamp ASC;
"

echo
echo "── TODOS los WA entrantes con usuario_id=13 (santiago capurro) hoy ──"
sqlite3 -separator '|' "$DB" "
  SELECT id, datetime(timestamp,'localtime') as ts, de, substr(cuerpo,1,200) as cuerpo
  FROM eventos
  WHERE canal='whatsapp' AND direccion='entrante'
    AND usuario_id=13
    AND date(timestamp,'localtime')='2026-05-26';
"

echo
echo "── últimos 20 eventos gmail entrantes hoy (para no perder nada) ──"
sqlite3 -separator '|' "$DB" "
  SELECT id, datetime(timestamp,'localtime') as ts, usuario_id, substr(de,1,60) as de, substr(coalesce(asunto,''),1,80) as asunto
  FROM eventos
  WHERE canal='gmail' AND direccion='entrante'
    AND date(timestamp,'localtime')='2026-05-26'
  ORDER BY timestamp DESC LIMIT 20;
"
