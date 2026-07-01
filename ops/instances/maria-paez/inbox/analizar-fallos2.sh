#!/bin/bash
OUT_DIR="$(dirname "$0")/../outbox"; mkdir -p "$OUT_DIR"; OUT="$OUT_DIR/analizar-fallos2.out"
DB="${MARIA_DB:?}"
{
echo "=== acciones FALLÓ desde 14:09 (detalle) ==="
sqlite3 -list -separator ' | ' "$DB" "SELECT id, datetime(timestamp,'localtime'), usuario_id, substr(cuerpo,10,190) FROM eventos WHERE cuerpo LIKE 'acción FALLÓ%' AND timestamp>=datetime('2026-07-01 14:09:00') ORDER BY id;"
echo
echo "=== conteo de fallos por tipo/mensaje ==="
sqlite3 -list -separator ' | ' "$DB" "SELECT substr(cuerpo,1,60), COUNT(*) FROM eventos WHERE cuerpo LIKE 'acción FALLÓ%' AND timestamp>=datetime('2026-07-01 14:09:00') GROUP BY substr(cuerpo,1,60) ORDER BY 2 DESC;"
echo
echo "=== hilo de acciones (OK+FALLO) desde 14:09 para ver auto-recuperación ==="
sqlite3 -list -separator ' | ' "$DB" "SELECT id, datetime(timestamp,'localtime'), usuario_id, substr(cuerpo,1,90) FROM eventos WHERE (cuerpo LIKE 'acción ejecutada%' OR cuerpo LIKE 'acción FALLÓ%') AND timestamp>=datetime('2026-07-01 14:09:00') ORDER BY id;"
} > "$OUT" 2>&1
echo done >> "$OUT"
