#!/bin/bash
set -a; cf=/root/secretaria/config/instances/maria-paez.conf; . "$cf"; set +a
DB="${MARIA_DB}"
echo "== distribución claude_calls últimas 48h (resume vs full) por canal =="
sqlite3 -separator ' | ' "$DB" "
SELECT json_extract(metadata_json,'\$.canal') canal,
  CASE WHEN json_extract(metadata_json,'\$.prompt_chars') < 20000 THEN 'RESUME' ELSE 'FULL' END tipo,
  COUNT(*) n, ROUND(AVG(json_extract(metadata_json,'\$.prompt_chars'))) avg_c,
  ROUND(AVG(json_extract(metadata_json,'\$.cost_usd')),4) avg_usd
FROM eventos WHERE canal='sistema' AND timestamp >= datetime('now','-48 hours')
  AND json_extract(metadata_json,'\$.tipo')='claude_call'
GROUP BY canal, tipo ORDER BY canal, tipo;"
echo ""
echo "== ¿dónde viven las sesiones? tablas y claves estado_usuario relacionadas =="
sqlite3 "$DB" "SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE '%sesion%' OR name LIKE '%session%');"
sqlite3 "$DB" "SELECT DISTINCT substr(clave,1,30) FROM estado_usuario WHERE clave LIKE '%sesion%' OR clave LIKE '%session%' LIMIT 20;"
echo ""
echo "== logs pm2: líneas [WA sesion] / sesion:resume últimas =="
pm2 logs maria-paez --lines 2000 --nostream 2>/dev/null | grep -iE "sesion|session|resume" | tail -30
