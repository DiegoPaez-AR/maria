#!/bin/bash
OUT_DIR="$(dirname "$0")/../outbox"; mkdir -p "$OUT_DIR"; OUT="$OUT_DIR/fallos-real.out"
DB="${MARIA_DB:?}"
{
echo "=== VENTANA REAL: acciones desde el re-flip (>= 14:09 LOCAL) ==="
echo "-- OK vs FALLO:"
sqlite3 -list -separator ' | ' "$DB" "SELECT CASE WHEN cuerpo LIKE 'acción ejecutada%' THEN 'OK' ELSE 'FALLO' END, COUNT(*) FROM eventos WHERE (cuerpo LIKE 'acción ejecutada%' OR cuerpo LIKE 'acción FALLÓ%') AND datetime(timestamp,'localtime')>='2026-07-01 14:09:00' GROUP BY 1;"
echo
echo "-- si hay FALLOS reales post-reflip, detalle:"
sqlite3 -list -separator ' | ' "$DB" "SELECT id, datetime(timestamp,'localtime'), usuario_id, substr(cuerpo,1,120) FROM eventos WHERE cuerpo LIKE 'acción FALLÓ%' AND datetime(timestamp,'localtime')>='2026-07-01 14:09:00' ORDER BY id;"
echo "(si vacío = 0 fallos reales en el trial)"
echo
echo "=== comparación: fallos ANTES del reflip (pre-MCP + mis smokes) por tipo ==="
sqlite3 -list -separator ' | ' "$DB" "SELECT substr(cuerpo,14,45), COUNT(*) FROM eventos WHERE cuerpo LIKE 'acción FALLÓ%' AND datetime(timestamp,'localtime')<'2026-07-01 14:09:00' AND datetime(timestamp,'localtime')>='2026-07-01 00:00:00' GROUP BY substr(cuerpo,14,45) ORDER BY 2 DESC;"
echo
echo "=== turnos WA reales en el trial (>=14:09 local) + mcp_fallback ==="
sqlite3 -list -separator ' | ' "$DB" "SELECT 'claude_calls_wa', COUNT(*) FROM eventos WHERE json_extract(metadata_json,'\$.tipo')='claude_call' AND json_extract(metadata_json,'\$.canal')='whatsapp' AND datetime(timestamp,'localtime')>='2026-07-01 14:09:00';"
sqlite3 -list -separator ' | ' "$DB" "SELECT 'mcp_fallback', COUNT(*) FROM eventos WHERE json_extract(metadata_json,'\$.tipo')='mcp_fallback' AND datetime(timestamp,'localtime')>='2026-07-01 14:09:00';"
} > "$OUT" 2>&1
echo done >> "$OUT"
