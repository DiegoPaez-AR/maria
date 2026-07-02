#!/bin/bash
DB="$MARIA_DB"
echo "== eventos 8031 =="
sqlite3 -readonly "$DB" "SELECT id, datetime(timestamp,'localtime'), direccion, de, nombre, substr(replace(cuerpo,char(10),' | '),1,500) FROM eventos WHERE de LIKE '%1123348031%' OR cuerpo LIKE '%1123348031%' ORDER BY id;" 2>&1
echo "== contacto 8031 =="
sqlite3 -readonly "$DB" -line "SELECT * FROM contactos WHERE whatsapp LIKE '%1123348031%';" 2>&1
echo "== eventos alrededor: primer contacto saliente a 8031 =="
sqlite3 -readonly "$DB" "SELECT id, datetime(timestamp,'localtime'), direccion, de, substr(replace(cuerpo,char(10),' | '),1,400) FROM eventos WHERE id BETWEEN (SELECT MIN(id)-15 FROM eventos WHERE de LIKE '%1123348031%') AND (SELECT MIN(id)+2 FROM eventos WHERE de LIKE '%1123348031%') ORDER BY id;" 2>&1
