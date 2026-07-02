#!/bin/bash
# Reporte diario trial MCP actions — últimas 24h
DB="${MARIA_DB:?falta MARIA_DB}"
Q() { sqlite3 "$DB" "$1"; }
echo "== flag =="
grep MARIA_MCP_ACTIONS /root/secretaria/config/instances/maria-paez.conf || echo "SIN FLAG EN CONF"
echo "== mcp_fallback 24h =="
Q "SELECT COUNT(*) FROM eventos WHERE json_extract(metadata_json,'\$.tipo')='mcp_fallback' AND timestamp >= datetime('now','-24 hours');"
echo "-- detalle (últimos 10) --"
Q "SELECT timestamp, substr(cuerpo,1,200) FROM eventos WHERE json_extract(metadata_json,'\$.tipo')='mcp_fallback' AND timestamp >= datetime('now','-24 hours') ORDER BY timestamp DESC LIMIT 10;"
echo "== acciones 24h =="
echo -n "ejecutadas: "
Q "SELECT COUNT(*) FROM eventos WHERE cuerpo LIKE 'acción ejecutada%' AND timestamp >= datetime('now','-24 hours');"
echo -n "falladas: "
Q "SELECT COUNT(*) FROM eventos WHERE cuerpo LIKE 'acción FALLÓ%' AND timestamp >= datetime('now','-24 hours');"
echo "-- falladas detalle (últimas 10) --"
Q "SELECT timestamp, substr(cuerpo,1,200) FROM eventos WHERE cuerpo LIKE 'acción FALLÓ%' AND timestamp >= datetime('now','-24 hours') ORDER BY timestamp DESC LIMIT 10;"
echo "== turnos claude_call whatsapp 24h =="
Q "SELECT COUNT(*) FROM eventos WHERE json_extract(metadata_json,'\$.tipo')='claude_call' AND json_extract(metadata_json,'\$.canal')='whatsapp' AND timestamp >= datetime('now','-24 hours');"
