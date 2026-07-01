#!/bin/bash
OUT_DIR="$(dirname "$0")/../outbox"; mkdir -p "$OUT_DIR"; OUT="$OUT_DIR/dump-rodrigo.out"
DB="${MARIA_DB:?}"
{
echo "=== Rodrigo en libretas (quién lo tiene) ==="
sqlite3 -list -separator ' | ' "$DB" "SELECT id,usuario_id,nombre,whatsapp FROM contactos WHERE nombre LIKE '%Rodrigo%' OR whatsapp LIKE '%57276026%';"
echo
echo "=== eventos ultimas 3h que tocan a Rodrigo (nro 57276026) o 'escalar'/'hablé de más' ==="
sqlite3 -list -separator ' | ' "$DB" "SELECT id, datetime(timestamp,'localtime') ts, canal, direccion, usuario_id uid, substr(coalesce(de,''),1,16) de, substr(replace(replace(cuerpo,char(10),' '),char(13),''),1,220) cuerpo FROM eventos WHERE datetime(timestamp,'localtime')>=datetime('now','localtime','-3 hours') AND (de LIKE '%57276026%' OR cuerpo LIKE '%Rodrigo%' OR cuerpo LIKE '%escalar%' OR cuerpo LIKE '%escalo%' OR cuerpo LIKE '%hablé de más%' OR cuerpo LIKE '%hable de mas%') ORDER BY id ASC;"
echo
echo "=== logs internos de ruteo/unknown-flow ultimas 3h (razonamiento, prospecto, homonimo, no ruteado) ==="
sqlite3 -list -separator ' | ' "$DB" "SELECT id, datetime(timestamp,'localtime') ts, substr(replace(cuerpo,char(10),' '),1,200) FROM eventos WHERE canal='sistema' AND datetime(timestamp,'localtime')>=datetime('now','localtime','-3 hours') AND (cuerpo LIKE '%unknown%' OR cuerpo LIKE '%prospecto%' OR cuerpo LIKE '%homón%' OR cuerpo LIKE '%homon%' OR cuerpo LIKE '%no rute%' OR cuerpo LIKE '%ambig%' OR cuerpo LIKE '%Rodrigo%' OR cuerpo LIKE '%razonamiento%Rodrigo%') ORDER BY id ASC;"
} > "$OUT" 2>&1
echo done >> "$OUT"
