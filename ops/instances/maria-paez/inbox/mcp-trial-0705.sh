#!/bin/bash
# Reporte diario trial MCP actions - 24h
DB="${MARIA_DB:-/root/secretaria/state/maria-paez/db/maria.sqlite}"
echo "== DB: $DB =="
echo "== flag en .conf (post-cleanup se espera VACIO) =="
grep MARIA_MCP_ACTIONS /root/secretaria/config/instances/maria-paez.conf || echo "(sin linea MARIA_MCP_ACTIONS — legacy cleanup)"
echo
echo "== mcp_fallback 24h =="
sqlite3 "$DB" "SELECT COUNT(*) FROM eventos WHERE json_extract(metadata_json,'\$.tipo')='mcp_fallback' AND timestamp >= datetime('now','-24 hours');"
echo "-- detalle fallbacks (si hay) --"
sqlite3 "$DB" "SELECT datetime(timestamp,'localtime')||' | '||substr(cuerpo,1,400) FROM eventos WHERE json_extract(metadata_json,'\$.tipo')='mcp_fallback' AND timestamp >= datetime('now','-24 hours') ORDER BY timestamp;"
echo
echo "== acciones 24h: ejecutadas vs FALLO =="
sqlite3 "$DB" "SELECT 'OK: '||SUM(CASE WHEN cuerpo LIKE 'acción ejecutada%' THEN 1 ELSE 0 END)||' / FALLO: '||SUM(CASE WHEN cuerpo LIKE 'acción FALLÓ%' THEN 1 ELSE 0 END) FROM eventos WHERE timestamp >= datetime('now','-24 hours');"
echo "-- detalle fallas --"
sqlite3 "$DB" "SELECT datetime(timestamp,'localtime')||' | '||substr(cuerpo,1,300) FROM eventos WHERE cuerpo LIKE 'acción FALLÓ%' AND timestamp >= datetime('now','-24 hours') ORDER BY timestamp;"
echo "-- tipos de accion ejecutados --"
sqlite3 "$DB" "SELECT substr(cuerpo,1,60), COUNT(*) FROM eventos WHERE cuerpo LIKE 'acción ejecutada%' AND timestamp >= datetime('now','-24 hours') GROUP BY 1 ORDER BY 2 DESC;"
echo
echo "== claude_call whatsapp 24h (turnos) =="
sqlite3 "$DB" "SELECT COUNT(*) FROM eventos WHERE json_extract(metadata_json,'\$.tipo')='claude_call' AND (json_extract(metadata_json,'\$.canal')='whatsapp' OR de LIKE '%whatsapp%') AND timestamp >= datetime('now','-24 hours');"
