#!/bin/bash
OUT_DIR="$(dirname "$0")/../outbox"; mkdir -p "$OUT_DIR"; OUT="$OUT_DIR/latency-telemetry.out"
DB="${MARIA_DB:?}"
{
echo "MAX_THINKING_TOKENS=${MAX_THINKING_TOKENS:-<unset>}"
echo "CLAUDE_MODEL=${CLAUDE_MODEL:-<unset>} ANTHROPIC_MODEL=${ANTHROPIC_MODEL:-<unset>}"
echo
echo "=== claude_call ultimas 48h: agregados (solo canal whatsapp) ==="
sqlite3 "$DB" <<SQL
.mode column
.headers on
WITH c AS (
  SELECT
    CAST(json_extract(metadata_json,'\$.ms') AS INT)             AS ms,
    CAST(json_extract(metadata_json,'\$.ttfb_ms') AS INT)        AS ttfb,
    CAST(json_extract(metadata_json,'\$.api_ms') AS INT)         AS api,
    CAST(json_extract(metadata_json,'\$.tokens_out') AS INT)     AS out,
    CAST(json_extract(metadata_json,'\$.cache_read') AS INT)     AS cread,
    CAST(json_extract(metadata_json,'\$.cache_creation') AS INT) AS cnew,
    CAST(json_extract(metadata_json,'\$.tokens_in') AS INT)      AS tin,
    CAST(json_extract(metadata_json,'\$.num_turns') AS INT)      AS turns,
    json_extract(metadata_json,'\$.canal') AS canal
  FROM eventos
  WHERE json_extract(metadata_json,'\$.tipo')='claude_call'
    AND timestamp >= datetime('now','-48 hours')
)
SELECT canal, COUNT(*) n,
  ROUND(AVG(ms)) avg_ms, ROUND(AVG(ttfb)) avg_ttfb, ROUND(AVG(api)) avg_api,
  ROUND(AVG(out)) avg_out, ROUND(AVG(cread)) avg_cread, ROUND(AVG(cnew)) avg_cnew, ROUND(AVG(turns),2) avg_turns
FROM c GROUP BY canal;
SQL
echo
echo "=== percentiles de ms y api (whatsapp) ==="
sqlite3 "$DB" <<SQL
WITH c AS (
  SELECT CAST(json_extract(metadata_json,'\$.ms') AS INT) ms,
         CAST(json_extract(metadata_json,'\$.api_ms') AS INT) api,
         CAST(json_extract(metadata_json,'\$.tokens_out') AS INT) out
  FROM eventos
  WHERE json_extract(metadata_json,'\$.tipo')='claude_call'
    AND json_extract(metadata_json,'\$.canal')='whatsapp'
    AND timestamp >= datetime('now','-48 hours'))
SELECT 'p50_ms' k, (SELECT ms FROM c ORDER BY ms LIMIT 1 OFFSET (SELECT COUNT(*)/2 FROM c)) v
UNION ALL SELECT 'p90_ms', (SELECT ms FROM c ORDER BY ms LIMIT 1 OFFSET (SELECT COUNT(*)*9/10 FROM c))
UNION ALL SELECT 'p50_api',(SELECT api FROM c ORDER BY api LIMIT 1 OFFSET (SELECT COUNT(*)/2 FROM c))
UNION ALL SELECT 'p90_api',(SELECT api FROM c ORDER BY api LIMIT 1 OFFSET (SELECT COUNT(*)*9/10 FROM c));
SQL
echo
echo "=== api_ms promedio por bucket de tokens_out (whatsapp) — ¿latencia ~ output? ==="
sqlite3 "$DB" -column -header <<SQL
WITH c AS (
  SELECT CAST(json_extract(metadata_json,'\$.api_ms') AS INT) api,
         CAST(json_extract(metadata_json,'\$.tokens_out') AS INT) out,
         CAST(json_extract(metadata_json,'\$.ttfb_ms') AS INT) ttfb
  FROM eventos
  WHERE json_extract(metadata_json,'\$.tipo')='claude_call'
    AND json_extract(metadata_json,'\$.canal')='whatsapp'
    AND timestamp >= datetime('now','-48 hours'))
SELECT CASE
    WHEN out<200 THEN '1. <200' WHEN out<600 THEN '2. 200-600'
    WHEN out<1200 THEN '3. 600-1200' WHEN out<2500 THEN '4. 1200-2500'
    ELSE '5. 2500+' END bucket,
  COUNT(*) n, ROUND(AVG(out)) avg_out, ROUND(AVG(ttfb)) avg_ttfb, ROUND(AVG(api)) avg_api
FROM c GROUP BY bucket ORDER BY bucket;
SQL
} > "$OUT" 2>&1
echo "done $(date)" >> "$OUT"
