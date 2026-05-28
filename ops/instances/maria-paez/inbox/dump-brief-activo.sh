#!/bin/bash
set -uo pipefail
DB="$MARIA_DB"
echo "── usuarios: estado de brief ──"
echo "(brief_activo: 1/NULL = recibe brief · 0 = pausado)"
echo
sqlite3 -header -column "$DB" "
  SELECT id,
         nombre,
         rol,
         activo,
         COALESCE(brief_activo, '(null)') AS brief_activo,
         brief_hora || ':' || brief_minuto AS hora,
         tz,
         CASE WHEN activo=0 THEN 'usuario inactivo'
              WHEN brief_activo=0 THEN 'BRIEF PAUSADO'
              ELSE 'brief ON' END AS estado_brief
  FROM usuarios
  ORDER BY id;
"
