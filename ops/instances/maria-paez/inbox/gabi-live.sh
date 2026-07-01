#!/bin/bash
OUT_DIR="$(dirname "$0")/../outbox"; mkdir -p "$OUT_DIR"; OUT="$OUT_DIR/gabi-live.out"
DB="${MARIA_DB:?}"
{
echo "=== Gabi: eventos ultimas 3h (todo su flow) ==="
sqlite3 "$DB" ".mode list
.separator ' | '
SELECT id, datetime(timestamp,'localtime') ts, canal, direccion, usuario_id,
 substr(replace(replace(cuerpo,char(10),' / '),char(13),''),1,400)
FROM eventos
WHERE timestamp >= datetime('now','-3 hours')
  AND (usuario_id=18 OR de LIKE '%5491165286555%')
ORDER BY id ASC;"
echo
echo "=== algún envío alguna vez a Ana Clara (a.zamora)? ==="
sqlite3 "$DB" "SELECT id, datetime(timestamp,'localtime'), canal, direccion, substr(cuerpo,1,120) FROM eventos WHERE cuerpo LIKE '%zamora%' OR cuerpo LIKE '%Ana Clara%' ORDER BY id;"
echo
echo "=== pendientes de Gabi ahora ==="
sqlite3 -column -header "$DB" "SELECT id,desc,dueno,disparador,estado FROM pendientes WHERE usuario_id=18;"
} > "$OUT" 2>&1
echo done >> "$OUT"
