#!/bin/bash
# Reporte diario trial MCP actions — 24h
DB="${MARIA_DB:-/root/secretaria/state/maria-paez/db/maria.sqlite}"
Q(){ sqlite3 "$DB" "$1"; }

echo "== FLAG =="
grep -n MARIA_MCP_ACTIONS /root/secretaria/config/instances/maria-paez.conf || echo "(sin línea MARIA_MCP_ACTIONS en el .conf)"

echo ""
echo "== MCP_FALLBACK 24h =="
Q "SELECT COUNT(*) FROM eventos WHERE (tipo='mcp_fallback' OR json_extract(metadata_json,'\$.tipo')='mcp_fallback') AND timestamp >= datetime('now','-24 hours');"
Q "SELECT timestamp, substr(cuerpo,1,400) FROM eventos WHERE (tipo='mcp_fallback' OR json_extract(metadata_json,'\$.tipo')='mcp_fallback') AND timestamp >= datetime('now','-24 hours') ORDER BY timestamp DESC LIMIT 10;"

echo ""
echo "== ACCIONES 24h (ejecutadas vs FALLÓ) =="
echo -n "ejecutadas: "; Q "SELECT COUNT(*) FROM eventos WHERE cuerpo LIKE 'acción ejecutada%' AND timestamp >= datetime('now','-24 hours');"
echo -n "falladas:   "; Q "SELECT COUNT(*) FROM eventos WHERE cuerpo LIKE 'acción FALLÓ%' AND timestamp >= datetime('now','-24 hours');"
echo "-- detalle ejecutadas (tipo de acción):"
Q "SELECT substr(cuerpo,1,120) FROM eventos WHERE cuerpo LIKE 'acción ejecutada%' AND timestamp >= datetime('now','-24 hours') ORDER BY timestamp;"
echo "-- detalle falladas:"
Q "SELECT timestamp, substr(cuerpo,1,300) FROM eventos WHERE cuerpo LIKE 'acción FALLÓ%' AND timestamp >= datetime('now','-24 hours') ORDER BY timestamp;"

echo ""
echo "== CLAUDE_CALL WA 24h (turnos) =="
Q "SELECT COUNT(*) FROM eventos WHERE (tipo='claude_call' OR json_extract(metadata_json,'\$.tipo')='claude_call') AND (json_extract(metadata_json,'\$.canal')='whatsapp' OR de LIKE '%whatsapp%') AND timestamp >= datetime('now','-24 hours');"
echo "-- claude_call por canal:"
Q "SELECT COALESCE(json_extract(metadata_json,'\$.canal'),'(sin canal)'), COUNT(*) FROM eventos WHERE (tipo='claude_call' OR json_extract(metadata_json,'\$.tipo')='claude_call') AND timestamp >= datetime('now','-24 hours') GROUP BY 1;"
