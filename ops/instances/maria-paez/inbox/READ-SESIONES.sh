#!/bin/bash
# Lectura en frío de las sesiones v2 del día
set -a; cf=/root/secretaria/config/instances/maria-paez.conf; . "$cf"; set +a
DB="${MARIA_DB}"
echo "== DB: $DB"
echo ""
echo "== claude_calls de hoy: distribución prompt_chars (resume vs full) =="
sqlite3 "$DB" "
SELECT 
  CASE WHEN json_extract(metadata_json,'\$.prompt_chars') < 20000 THEN 'RESUME(<20k)' ELSE 'FULL(>=20k)' END AS tipo,
  COUNT(*) n,
  ROUND(AVG(json_extract(metadata_json,'\$.prompt_chars'))) avg_chars,
  ROUND(AVG(json_extract(metadata_json,'\$.cost_usd')),4) avg_usd
FROM eventos
WHERE canal='sistema' AND date(timestamp)=date('now')
  AND json_extract(metadata_json,'\$.tipo')='claude_call'
GROUP BY tipo;"
echo ""
echo "== últimos 25 claude_call (hora, canal, chars, turnos, cache, costo) =="
sqlite3 -separator ' | ' "$DB" "
SELECT substr(timestamp,12,5),
  json_extract(metadata_json,'\$.canal'),
  json_extract(metadata_json,'\$.prompt_chars')||'c',
  't'||COALESCE(json_extract(metadata_json,'\$.num_turns'),'?'),
  'cr'||COALESCE(json_extract(metadata_json,'\$.cache_read'),0),
  '\$'||COALESCE(json_extract(metadata_json,'\$.cost_usd'),'?')
FROM eventos
WHERE canal='sistema' AND date(timestamp)=date('now')
  AND json_extract(metadata_json,'\$.tipo')='claude_call'
ORDER BY timestamp DESC LIMIT 25;"
