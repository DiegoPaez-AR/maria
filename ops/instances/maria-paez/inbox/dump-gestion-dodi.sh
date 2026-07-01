#!/bin/bash
OUT_DIR="$(dirname "$0")/../outbox"; mkdir -p "$OUT_DIR"; OUT="$OUT_DIR/dump-gestion-dodi.out"
DB="${MARIA_DB:?}"
{
echo "=== follow_ups que esperan a Rodrigo/Dodi (57276026) — bajo qué usuario? ==="
sqlite3 -list -separator ' | ' "$DB" "SELECT id,usuario_id,estado,esperando_de,esperando_canal,substr(descripcion,1,50) FROM follow_ups WHERE esperando_de LIKE '%57276026%' OR descripcion LIKE '%Dodi%' OR descripcion LIKE '%Rodrigo%';"
echo
echo "=== pendientes de maria con esperando_de = Rodrigo/Dodi — bajo qué usuario? ==="
sqlite3 -list -separator ' | ' "$DB" "SELECT id,usuario_id,estado,substr(desc,1,50),substr(meta_json,1,120) FROM pendientes WHERE meta_json LIKE '%57276026%' OR desc LIKE '%Dodi%' OR desc LIKE '%Rodrigo%';"
echo
echo "=== TODOS los follow_ups abiertos de Gabi (uid=18) ==="
sqlite3 -list -separator ' | ' "$DB" "SELECT id,estado,esperando_de,substr(descripcion,1,50) FROM follow_ups WHERE usuario_id=18;"
echo
echo "=== tu hilo directo con María (uid=1, tu wa) 17:00-20:00: buscar 'escalar/hablé de más' ==="
sqlite3 -list -separator ' | ' "$DB" "SELECT id,datetime(timestamp,'localtime'),direccion,substr(replace(cuerpo,char(10),' '),1,150) FROM eventos WHERE canal='whatsapp' AND (de LIKE '%34342575317160%' OR de LIKE '%1132317896%') AND datetime(timestamp,'localtime')>='2026-07-01 17:00:00' ORDER BY id ASC;"
} > "$OUT" 2>&1
echo done >> "$OUT"
