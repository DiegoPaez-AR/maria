#!/bin/bash
set -u
DB="${MARIA_DB:-/root/secretaria/state/maria-paez/db/maria.sqlite}"
echo "== gmail salientes con zamora en metadata (emails A ella) =="
sqlite3 -header "$DB" "SELECT id, timestamp, direccion, substr(COALESCE(asunto,''),1,60) a, substr(COALESCE(metadata_json,''),1,150) m FROM eventos WHERE canal='gmail' AND metadata_json LIKE '%zamora%' ORDER BY id;"
echo "== gmail entrantes DE zamora (respuestas de ella) =="
sqlite3 "$DB" "SELECT COUNT(*) FROM eventos WHERE canal='gmail' AND direccion='entrante' AND de LIKE '%zamora%';"
echo "== entrantes WA de Ana Clara (5491141981886) =="
sqlite3 -header "$DB" "SELECT id, timestamp, direccion, substr(cuerpo,1,150) c FROM eventos WHERE de LIKE '%1141981886%' ORDER BY id DESC LIMIT 5;"
