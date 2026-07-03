#!/bin/bash
set -u
DB="${MARIA_DB:-/root/secretaria/state/maria-paez/db/maria.sqlite}"
echo "== eventos con zamora (cualquier canal) =="
sqlite3 -header "$DB" "SELECT id, timestamp, canal, direccion, de, substr(COALESCE(asunto,''),1,50) a, substr(cuerpo,1,150) c FROM eventos WHERE de LIKE '%zamora%' OR cuerpo LIKE '%zamora%' OR asunto LIKE '%zamora%' ORDER BY id DESC LIMIT 10;"
echo "== eventos con 'ana clara' =="
sqlite3 -header "$DB" "SELECT id, timestamp, canal, direccion, de, substr(cuerpo,1,150) c FROM eventos WHERE cuerpo LIKE '%ana clara%' ORDER BY id DESC LIMIT 12;"
echo "== pendiente vinculado a fu24 =="
sqlite3 -header "$DB" "SELECT id, estado, usuario_id, substr(descripcion,1,120), metadata_json FROM pendientes WHERE metadata_json LIKE '%\"follow_up_id\":24%' OR metadata_json LIKE '%follow_up_id\": 24%';"
