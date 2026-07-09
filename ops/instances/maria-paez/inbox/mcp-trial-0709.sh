#!/bin/bash
# Reporte diario trial MCP actions — últimas 24h
DB="$MARIA_DB"
echo "== DB: $DB =="
[ -f "$DB" ] || { echo "ERROR: DB no existe"; exit 1; }
Q(){ sqlite3 "$DB" "$1"; }

echo "== mcp_fallback 24h =="
Q "SELECT COUNT(*) FROM eventos WHERE json_extract(metadata_json,'\$.tipo')='mcp_fallback' AND timestamp >= datetime('now','-24 hours');"
echo "-- detalle (si hay) --"
Q "SELECT timestamp, substr(cuerpo,1,300) FROM eventos WHERE json_extract(metadata_json,'\$.tipo')='mcp_fallback' AND timestamp >= datetime('now','-24 hours') ORDER BY timestamp DESC LIMIT 10;"

echo "== acciones ejecutadas OK 24h =="
Q "SELECT COUNT(*) FROM eventos WHERE cuerpo LIKE 'acción ejecutada%' AND timestamp >= datetime('now','-24 hours');"
echo "-- por tipo --"
Q "SELECT substr(cuerpo,1,80), COUNT(*) FROM eventos WHERE cuerpo LIKE 'acción ejecutada%' AND timestamp >= datetime('now','-24 hours') GROUP BY substr(cuerpo,1,80);"

echo "== acciones FALLÓ 24h =="
Q "SELECT COUNT(*) FROM eventos WHERE cuerpo LIKE 'acción FALLÓ%' AND timestamp >= datetime('now','-24 hours');"
echo "-- detalle --"
Q "SELECT timestamp, substr(cuerpo,1,300) FROM eventos WHERE cuerpo LIKE 'acción FALLÓ%' AND timestamp >= datetime('now','-24 hours') ORDER BY timestamp DESC LIMIT 10;"

echo "== flag en .conf =="
grep -n MARIA_MCP_ACTIONS /root/secretaria/config/instances/maria-paez.conf || echo "(sin línea MARIA_MCP_ACTIONS en el .conf)"

echo "== claude_call 24h por canal =="
Q "SELECT COALESCE(json_extract(metadata_json,'\$.canal'),'?'), COUNT(*) FROM eventos WHERE json_extract(metadata_json,'\$.tipo')='claude_call' AND timestamp >= datetime('now','-24 hours') GROUP BY 1;"

echo "== wa-apagado marker =="
ls -la /root/secretaria/state/maria-paez/wa-apagado 2>/dev/null || echo "(sin marker wa-apagado)"
