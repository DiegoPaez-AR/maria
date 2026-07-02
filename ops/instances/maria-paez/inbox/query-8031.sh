#!/bin/bash
DB="$MARIA_DB"
echo "== eventos con 1123348031 =="
sqlite3 -readonly "$DB" "SELECT id, datetime(ts,'localtime'), canal, direccion, quien, substr(replace(texto,char(10),' / '),1,400) FROM eventos WHERE quien LIKE '%1123348031%' OR texto LIKE '%1123348031%' ORDER BY id;" 2>&1
echo "== contactos =="
sqlite3 -readonly "$DB" "SELECT * FROM contactos WHERE wa LIKE '%1123348031%' OR nombre LIKE '%caseros%' COLLATE NOCASE OR nombre LIKE '%chalaca%' COLLATE NOCASE;" 2>&1
echo "== pendientes relacionados =="
sqlite3 -readonly "$DB" "SELECT id, estado, datetime(creado,'localtime'), dueno, substr(descripcion,1,300), meta FROM pendientes WHERE descripcion LIKE '%caseros%' COLLATE NOCASE OR descripcion LIKE '%chalaca%' COLLATE NOCASE OR meta LIKE '%8031%' ORDER BY id;" 2>&1
echo "== usuarios con ese wa =="
sqlite3 -readonly "$DB" "SELECT id, nombre, wa_cus, rol FROM usuarios WHERE wa_cus LIKE '%1123348031%';" 2>&1
