#!/bin/bash
OUT_DIR="$(dirname "$0")/../outbox"; mkdir -p "$OUT_DIR"; OUT="$OUT_DIR/review-mcp-adopcion.out"
DB="${MARIA_DB:?}"
{
echo "=== turnos claude_call desde el flip (>= 13:27 hoy) ==="
sqlite3 -column -header "$DB" "SELECT COUNT(*) n_claude_calls FROM eventos WHERE json_extract(metadata_json,'\$.tipo')='claude_call' AND timestamp >= datetime('now','-1 hours');"
echo "=== acciones ejecutadas vs falladas (ultima hora) ==="
sqlite3 -column -header "$DB" "SELECT direccion, substr(cuerpo,1,40) tipo_evento, COUNT(*) FROM eventos WHERE (cuerpo LIKE 'acción ejecutada%' OR cuerpo LIKE 'acción FALLÓ%') AND timestamp >= datetime('now','-1 hours') GROUP BY substr(cuerpo,1,40) ORDER BY 3 DESC LIMIT 20;"
echo "=== mcp_fallback (misses de adopción) ultima hora ==="
sqlite3 -column -header "$DB" "SELECT id, datetime(timestamp,'localtime') ts, substr(cuerpo,1,120) FROM eventos WHERE json_extract(metadata_json,'\$.tipo')='mcp_fallback' AND timestamp >= datetime('now','-2 hours');"
echo "(si vacío = ningún miss)"
echo "=== últimos 20 eventos entrantes/salientes/interno desde 13:25 (para ver un turno real) ==="
sqlite3 "$DB" ".mode list
.separator ' | '
SELECT id, datetime(timestamp,'localtime'), canal, direccion, substr(replace(cuerpo,char(10),' '),1,90) FROM eventos WHERE timestamp >= datetime('now','-90 minutes') AND canal IN ('whatsapp','sistema') ORDER BY id DESC LIMIT 22;"
} > "$OUT" 2>&1
echo done >> "$OUT"
