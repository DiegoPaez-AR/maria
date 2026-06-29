#!/bin/bash
set -u
IDB=/root/secretaria/state/maria-paez/db/maria.sqlite
IDS="11,14,15,17"
echo "== ANTES =="
sqlite3 -header -column "$IDB" "SELECT id, nombre, activo FROM usuarios WHERE id IN ($IDS) ORDER BY id;"
echo
echo "== UPDATE activo=0 =="
sqlite3 "$IDB" "UPDATE usuarios SET activo=0 WHERE id IN ($IDS);"
echo "filas afectadas: $(sqlite3 "$IDB" "SELECT changes();")"
echo
echo "== DESPUÉS =="
sqlite3 -header -column "$IDB" "SELECT id, nombre, activo FROM usuarios WHERE id IN ($IDS) ORDER BY id;"
echo
echo "== usuarios activos restantes =="
sqlite3 -header -column "$IDB" "SELECT COUNT(*) AS activos FROM usuarios WHERE activo=1;"
