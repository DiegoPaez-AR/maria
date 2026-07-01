#!/bin/bash
OUT_DIR="$(dirname "$0")/../outbox"; mkdir -p "$OUT_DIR"; OUT="$OUT_DIR/gabi-live2.out"
DB="${MARIA_DB:?}"
{
echo "=== ultimos 25 eventos que involucran el numero de Gabi (con usuario_id) ==="
sqlite3 -line "$DB" "SELECT id, datetime(timestamp,'localtime') ts, canal, direccion, usuario_id uid, substr(replace(cuerpo,char(10),' '),1,220) cuerpo FROM eventos WHERE de LIKE '%5491165286555%' OR (usuario_id IN (1,18) AND cuerpo LIKE '%Ana Clara%') ORDER BY id DESC LIMIT 25;"
echo
echo "=== CUALQUIER saliente a a.zamora (Ana Clara) en toda la historia ==="
sqlite3 -line "$DB" "SELECT id, datetime(timestamp,'localtime'), direccion, canal, substr(cuerpo,1,200) FROM eventos WHERE cuerpo LIKE '%zamora%' ORDER BY id;"
echo
echo "=== usuario_id de los ultimos 6 entrantes del numero de Gabi (pre/post backfill) ==="
sqlite3 -column -header "$DB" "SELECT id, datetime(timestamp,'localtime') ts, usuario_id FROM eventos WHERE de LIKE '%5491165286555%' AND direccion='entrante' ORDER BY id DESC LIMIT 6;"
} > "$OUT" 2>&1
echo done >> "$OUT"
