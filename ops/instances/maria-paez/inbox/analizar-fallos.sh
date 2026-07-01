#!/bin/bash
OUT_DIR="$(dirname "$0")/../outbox"; mkdir -p "$OUT_DIR"; OUT="$OUT_DIR/analizar-fallos.out"
DB="${MARIA_DB:?}"
{
echo "=== las 8 (o las que sean) acciones FALLÓ desde el re-flip 14:09, con detalle ==="
sqlite3 "$DB" ".mode list
.separator ' || '
SELECT id, datetime(timestamp,'localtime'), usuario_id, substr(cuerpo,1,180) FROM eventos WHERE cuerpo LIKE 'acción FALLÓ%' AND timestamp>=datetime('2026-07-01 14:09:00') ORDER BY id;"
echo
echo "=== contexto: para cada fallo, el usuario y si hubo una acción OK del mismo tipo cerca (auto-recuperación) ==="
sqlite3 "$DB" ".mode list
.separator ' || '
SELECT id, datetime(timestamp,'localtime') ts, direccion, canal, substr(replace(cuerpo,char(10),' '),1,110) FROM eventos WHERE timestamp>=datetime('2026-07-01 14:09:00') AND (cuerpo LIKE 'acción %' OR canal='whatsapp') ORDER BY id;" | tail -80
} > "$OUT" 2>&1
echo done >> "$OUT"
