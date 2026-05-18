#!/bin/bash
set +e
DB="/root/secretaria/state/maria-paez/db/maria.sqlite"

echo "═══ Llamadas Claude últimos 7 días (tipo=claude_call en metadata) ═══"
sqlite3 -header -column "$DB" "
SELECT
  COUNT(*) AS total,
  SUM(CASE WHEN metadata_json LIKE '%\"error_msg\":null%' OR metadata_json NOT LIKE '%error_msg%' THEN 1 ELSE 0 END) AS ok,
  SUM(CASE WHEN metadata_json LIKE '%error_msg%' AND metadata_json NOT LIKE '%\"error_msg\":null%' THEN 1 ELSE 0 END) AS error,
  MIN(json_extract(metadata_json, '\$.ms')) AS min_ms,
  MAX(json_extract(metadata_json, '\$.ms')) AS max_ms,
  ROUND(AVG(json_extract(metadata_json, '\$.ms'))) AS avg_ms
FROM eventos
WHERE canal='sistema' AND cuerpo LIKE 'claude_call%'
  AND timestamp >= datetime('now','-7 days');
"

echo ""
echo "═══ Top 15 más lentos (con prompt_chars y resultado) ═══"
sqlite3 -header -column "$DB" "
SELECT
  datetime(timestamp) AS ts,
  json_extract(metadata_json, '\$.ms') AS ms,
  json_extract(metadata_json, '\$.prompt_chars') AS prompt_c,
  json_extract(metadata_json, '\$.raw_chars') AS raw_c,
  substr(json_extract(metadata_json, '\$.error_msg'), 1, 50) AS err
FROM eventos
WHERE canal='sistema' AND cuerpo LIKE 'claude_call%'
  AND timestamp >= datetime('now','-7 days')
ORDER BY ms DESC
LIMIT 15;
"

echo ""
echo "═══ Bucketización por duración (ms) ═══"
sqlite3 -header -column "$DB" "
SELECT
  CASE
    WHEN ms < 5000   THEN '0-5s'
    WHEN ms < 15000  THEN '5-15s'
    WHEN ms < 30000  THEN '15-30s'
    WHEN ms < 60000  THEN '30-60s'
    WHEN ms < 120000 THEN '60-120s'
    WHEN ms < 180000 THEN '120-180s'
    ELSE '180s+'
  END AS bucket,
  COUNT(*) AS n
FROM (
  SELECT CAST(json_extract(metadata_json, '\$.ms') AS INTEGER) AS ms
  FROM eventos
  WHERE canal='sistema' AND cuerpo LIKE 'claude_call%'
    AND timestamp >= datetime('now','-7 days')
)
GROUP BY 1
ORDER BY MIN(ms);
"
