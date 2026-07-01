#!/bin/bash
OUT_DIR="$(dirname "$0")/../outbox"; mkdir -p "$OUT_DIR"; OUT="$OUT_DIR/dump-gabi.out"
DB="${MARIA_DB:?}"
{
echo "=== usuario Gabi ==="
sqlite3 -header -column "$DB" "SELECT id,nombre,wa_cus,email,calendar_id,calendar_acceso,rol,idioma,tz FROM usuarios WHERE nombre LIKE '%Echaniz%' OR nombre LIKE '%Gabr%';"
echo
echo "=== TODO el flow de Gabi (usuario_id=18 o de/para su wa), orden cronológico ==="
sqlite3 "$DB" <<SQL
.mode list
.separator " | "
SELECT id, datetime(timestamp,'localtime') ts, canal, direccion,
       substr(coalesce(de,''),1,20) de,
       substr(replace(replace(cuerpo,char(10),' / '),char(13),''),1,700) cuerpo
FROM eventos
WHERE timestamp >= datetime('now','-3 days')
  AND ( usuario_id = 18
        OR de LIKE '%5491165286555%' )
ORDER BY id ASC;
SQL
echo
echo "=== pendientes de Gabi (abiertos) ==="
sqlite3 -header -column "$DB" "SELECT id,desc,dueno,disparador,estado,creado FROM pendientes WHERE usuario_id=18 ORDER BY id;"
echo
echo "=== eventos calendar creados en el flow de Gabi ==="
sqlite3 "$DB" "SELECT id, datetime(timestamp,'localtime'), substr(cuerpo,1,160) FROM eventos WHERE usuario_id=18 AND canal='calendar' ORDER BY id;"
} > "$OUT" 2>&1
echo "done $(date)" >> "$OUT"
