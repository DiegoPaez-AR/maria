#!/bin/bash
# Gasto claude 30d: por dia-reporte (ventana 06:00 ART = 09:00 UTC) y modelo
DB=/root/secretaria/state/maria-paez/db/maria.sqlite
sqlite3 -header -column "$DB" "
  SELECT date(datetime(timestamp,'-9 hours')) AS dia_rep,
         CASE WHEN json_extract(metadata_json,'\$.canal')='moderacion' THEN 'haiku' ELSE 'main' END AS modelo,
         COUNT(*) AS calls,
         ROUND(COALESCE(SUM(json_extract(metadata_json,'\$.cost_usd')),0),4) AS cli_usd,
         SUM(COALESCE(json_extract(metadata_json,'\$.tokens_in'),0)) AS tin,
         SUM(COALESCE(json_extract(metadata_json,'\$.tokens_out'),0)) AS tout,
         SUM(COALESCE(json_extract(metadata_json,'\$.cache_read'),0)) AS cr,
         SUM(COALESCE(json_extract(metadata_json,'\$.cache_creation'),0)) AS cw
  FROM eventos
  WHERE canal='sistema' AND tipo='claude_call'
    AND timestamp >= datetime('now','-31 days')
  GROUP BY 1,2 ORDER BY 1,2;"
