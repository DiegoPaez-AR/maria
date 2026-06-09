#!/bin/bash
DB=/root/secretaria/state/maria-paez/db/maria.sqlite
echo "=== HILO eventos con Leandro (wid 5491140495070 o nombre) ==="
sqlite3 -header -column "$DB" "SELECT id, timestamp, canal, direccion, COALESCE(de,'') AS de, substr(COALESCE(cuerpo,''),1,160) AS cuerpo FROM eventos WHERE de LIKE '%5491140495070%' OR cuerpo LIKE '%eandro%' OR cuerpo LIKE '%roisman%' ORDER BY timestamp;"
echo
echo "=== ¿algún ENTRANTE de Leandro? (direccion entrante, de=su wid) ==="
sqlite3 -header -column "$DB" "SELECT id, timestamp, canal, substr(COALESCE(cuerpo,''),1,160) AS cuerpo FROM eventos WHERE de LIKE '%5491140495070%' AND direccion='entrante' ORDER BY timestamp;"
echo
echo "=== follow_ups esperando a Leandro ==="
sqlite3 -header -column "$DB" "SELECT id, creado, descripcion, esperando_de, vence_en, estado FROM follow_ups WHERE esperando_de LIKE '%5491140495070%' ORDER BY id;"
echo
echo "=== pm2 restarts (confirmar deploy de mi fix) ==="
cat /root/secretaria/ops/instances/maria-paez/snapshots/pm2-status.tsv
