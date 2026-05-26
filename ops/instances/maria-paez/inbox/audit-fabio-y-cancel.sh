#!/bin/bash
set -uo pipefail
cd /root/secretaria
DB="$MARIA_DB"

echo "── 1. tablas disponibles ──"
sqlite3 "$DB" ".tables"

echo
echo "── 2. schema de tablas candidatas a auditoría ──"
for t in acciones audit auditoria claude_calls eventos hechos_auditoria audit_log; do
  if sqlite3 "$DB" ".schema $t" 2>/dev/null | grep -q CREATE; then
    echo
    echo "--- $t ---"
    sqlite3 "$DB" ".schema $t"
  fi
done

echo
echo "── 3. eventos del 26-05 hoy alrededor de las 09:23 (cancel del 268) y 09:44 (cambio Fabio) ──"
sqlite3 -header -separator '|' "$DB" "
  SELECT datetime(ts,'localtime') as ts_local, tipo, substr(detalle,1,180) as detalle
  FROM eventos
  WHERE date(ts,'localtime') = '2026-05-26'
    AND (
      detalle LIKE '%268%' OR detalle LIKE '%Fabio%' OR detalle LIKE '%5491152189302%' OR detalle LIKE '%3492580906%'
      OR detalle LIKE '%actualizar_contacto%' OR detalle LIKE '%cancelar_programado%' OR tipo LIKE '%accion%'
    )
  ORDER BY ts ASC
  LIMIT 30;
" 2>/dev/null

echo
echo "── 4. últimas 5 claude_calls del usuario_id=1 (Diego) si la tabla existe ──"
sqlite3 -header -separator '|' "$DB" "
  SELECT id, datetime(ts,'localtime') as ts, canal, duracion_ms,
         substr(coalesce(acciones_json,''),1,200) as acciones,
         substr(coalesce(respuesta,''),1,120) as respuesta
  FROM claude_calls
  WHERE usuario_id=1
    AND datetime(ts,'localtime') >= '2026-05-26 09:00'
  ORDER BY ts DESC LIMIT 10;
" 2>/dev/null || echo "(tabla claude_calls no existe o columnas diferentes)"
