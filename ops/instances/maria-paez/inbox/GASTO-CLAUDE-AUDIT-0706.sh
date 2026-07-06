#!/bin/bash
echo "== claude CLI =="
command -v claude; claude --version 2>&1
echo "ANTHROPIC_MODEL=${ANTHROPIC_MODEL:-unset}"
if [ -n "${ANTHROPIC_API_KEY:-}" ]; then echo "API_KEY=set (${#ANTHROPIC_API_KEY} chars, prefix ${ANTHROPIC_API_KEY:0:12}...)"; else echo "API_KEY=unset"; fi

for db in /root/secretaria/state/*/db/maria.sqlite; do
  slug=$(basename "$(dirname "$(dirname "$db")")")
  echo; echo "== instancia: $slug =="
  sqlite3 -header -column "$db" "
    SELECT date(timestamp) AS dia_utc,
           COUNT(*) AS calls,
           COUNT(json_extract(metadata_json,'\$.cost_usd')) AS con_costo,
           ROUND(COALESCE(SUM(json_extract(metadata_json,'\$.cost_usd')),0),4) AS cost_usd,
           SUM(COALESCE(json_extract(metadata_json,'\$.tokens_in'),0)) AS tok_in,
           SUM(COALESCE(json_extract(metadata_json,'\$.tokens_out'),0)) AS tok_out,
           SUM(COALESCE(json_extract(metadata_json,'\$.cache_read'),0)) AS cache_read,
           SUM(COALESCE(json_extract(metadata_json,'\$.cache_creation'),0)) AS cache_new
    FROM eventos
    WHERE canal='sistema' AND tipo='claude_call'
      AND timestamp >= datetime('now','-14 days')
    GROUP BY 1 ORDER BY 1;"
  echo "-- por canal (14d) --"
  sqlite3 -header -column "$db" "
    SELECT COALESCE(json_extract(metadata_json,'\$.canal'),'?') AS canal,
           COUNT(*) AS calls,
           ROUND(COALESCE(SUM(json_extract(metadata_json,'\$.cost_usd')),0),4) AS cost_usd,
           SUM(COALESCE(json_extract(metadata_json,'\$.tokens_out'),0)) AS tok_out
    FROM eventos
    WHERE canal='sistema' AND tipo='claude_call'
      AND timestamp >= datetime('now','-14 days')
    GROUP BY 1 ORDER BY 3 DESC;"
done
