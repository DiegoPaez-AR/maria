#!/bin/bash
# Diagnóstico puntual: gasto Claude 24h (cobertura de cost_usd) + modelo de la CLI.
set +e
DB="${MARIA_DB:-/root/secretaria/state/maria-paez/db/maria.sqlite}"
echo "DB=$DB"
echo "==================== GASTO CLAUDE ===================="
echo "--- Ventana del reporte (igual que daily-report: timestamp >= now-24h UTC) ---"
sqlite3 "$DB" "
  SELECT
    COUNT(*)                                                       AS calls_total,
    COUNT(json_extract(metadata_json,'\$.cost_usd'))               AS con_costo,
    COUNT(*) - COUNT(json_extract(metadata_json,'\$.cost_usd'))    AS sin_costo,
    printf('%.4f', COALESCE(SUM(json_extract(metadata_json,'\$.cost_usd')),0)) AS total_usd_reportado
  FROM eventos
  WHERE canal='sistema' AND timestamp >= datetime('now','-24 hours')
    AND json_extract(metadata_json,'\$.tipo')='claude_call';
"
echo ""
echo "--- Gasto por contexto/canal en esas 24h (top) ---"
sqlite3 -column -header "$DB" "
  SELECT json_extract(metadata_json,'\$.canal') AS canal,
         COUNT(*) AS calls,
         COUNT(json_extract(metadata_json,'\$.cost_usd')) AS con_costo,
         printf('%.4f', COALESCE(SUM(json_extract(metadata_json,'\$.cost_usd')),0)) AS usd
  FROM eventos
  WHERE canal='sistema' AND timestamp >= datetime('now','-24 hours')
    AND json_extract(metadata_json,'\$.tipo')='claude_call'
  GROUP BY 1 ORDER BY usd+0 DESC;
"
echo ""
echo "--- Comparación: últimos 7 días, gasto por día (UTC) ---"
sqlite3 -column -header "$DB" "
  SELECT substr(timestamp,1,10) AS dia,
         COUNT(*) AS calls,
         COUNT(json_extract(metadata_json,'\$.cost_usd')) AS con_costo,
         printf('%.4f', COALESCE(SUM(json_extract(metadata_json,'\$.cost_usd')),0)) AS usd
  FROM eventos
  WHERE canal='sistema' AND timestamp >= datetime('now','-7 days')
    AND json_extract(metadata_json,'\$.tipo')='claude_call'
  GROUP BY 1 ORDER BY 1 DESC;
"
echo ""
echo "==================== MODELO / CLI ===================="
echo "claude --version: $(claude --version 2>&1 | head -1)"
echo "ANTHROPIC_MODEL=${ANTHROPIC_MODEL:-<no seteado>}"
echo "ANTHROPIC_SMALL_FAST_MODEL=${ANTHROPIC_SMALL_FAST_MODEL:-<no seteado>}"
echo "CLAUDE_SETTINGS_FILE=${CLAUDE_SETTINGS_FILE:-<no seteado>}"
if [ -n "$CLAUDE_SETTINGS_FILE" ] && [ -f "$CLAUDE_SETTINGS_FILE" ]; then
  echo "--- model en settings file ---"; grep -iE '"model"|"env"' "$CLAUDE_SETTINGS_FILE" 2>/dev/null | head
fi
if [ -n "$ANTHROPIC_API_KEY" ]; then echo "ANTHROPIC_API_KEY: presente (billing por API key)"; else echo "ANTHROPIC_API_KEY: NO presente (usa auth/suscripción de la CLI)"; fi
echo ""
echo "--- probe del modelo real (1 llamada barata, output-format json) ---"
PROBE=$(printf 'responde unicamente: ok' | timeout 90 claude -p --output-format json 2>/dev/null)
echo "$PROBE" | python3 -c "import sys,json
try:
    d=json.load(sys.stdin)
    print('model:', d.get('model'))
    mu=d.get('modelUsage') or d.get('model_usage')
    if mu: print('modelUsage keys:', list(mu.keys()))
    print('total_cost_usd del probe:', d.get('total_cost_usd'))
except Exception as e:
    print('no pude parsear json del probe:', e)
" 2>/dev/null || echo "$PROBE" | grep -ioE "claude-[a-z0-9.-]+" | sort -u | head
echo "==================== FIN ===================="
