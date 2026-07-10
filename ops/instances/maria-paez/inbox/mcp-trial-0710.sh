#!/bin/bash
# reporte diario trial MCP actions — 2026-07-10
OUT="$(dirname "$0")/../outbox/mcp-trial-0710.out"
mkdir -p "$(dirname "$OUT")"
{
echo "== mcp-trial 24h @ $(date -Is) =="
DB="${MARIA_DB:?falta MARIA_DB}"
echo "-- DB: $DB"

echo "-- mcp_fallback (24h):"
sqlite3 "$DB" "SELECT COUNT(*) FROM eventos WHERE json_extract(metadata_json,'\$.tipo')='mcp_fallback' AND timestamp >= datetime('now','-24 hours');"
echo "-- mcp_fallback detalle:"
sqlite3 "$DB" "SELECT timestamp, substr(cuerpo,1,300) FROM eventos WHERE json_extract(metadata_json,'\$.tipo')='mcp_fallback' AND timestamp >= datetime('now','-24 hours') ORDER BY timestamp;"

echo "-- acciones ejecutadas (24h):"
sqlite3 "$DB" "SELECT COUNT(*) FROM eventos WHERE cuerpo LIKE 'acción ejecutada%' AND timestamp >= datetime('now','-24 hours');"
echo "-- acciones FALLÓ (24h):"
sqlite3 "$DB" "SELECT COUNT(*) FROM eventos WHERE cuerpo LIKE 'acción FALLÓ%' AND timestamp >= datetime('now','-24 hours');"
echo "-- detalle acciones (tipo x resultado):"
sqlite3 "$DB" "SELECT substr(cuerpo,1,120) FROM eventos WHERE (cuerpo LIKE 'acción ejecutada%' OR cuerpo LIKE 'acción FALLÓ%') AND timestamp >= datetime('now','-24 hours') ORDER BY timestamp;"

echo "-- flag MARIA_MCP_ACTIONS en .conf:"
grep -n MARIA_MCP_ACTIONS /root/secretaria/config/instances/maria-paez.conf || echo "(sin línea)"

echo "-- claude_call por canal (24h):"
sqlite3 "$DB" "SELECT COALESCE(json_extract(metadata_json,'\$.canal'),'?'), COUNT(*) FROM eventos WHERE json_extract(metadata_json,'\$.tipo')='claude_call' AND timestamp >= datetime('now','-24 hours') GROUP BY 1;"

echo "-- marker wa-apagado:"
ls -la /root/secretaria/state/maria-paez/wa-apagado 2>/dev/null || echo "(no existe)"
echo "== fin =="
} > "$OUT" 2>&1
