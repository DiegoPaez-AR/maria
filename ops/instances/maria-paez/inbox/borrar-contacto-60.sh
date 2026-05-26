#!/bin/bash
set -uo pipefail
cd /root/secretaria
DB="$MARIA_DB"

echo "── ANTES — Santi en libreta de Diego ──"
sqlite3 -header "$DB" "SELECT id, nombre, whatsapp, email FROM contactos WHERE usuario_id=1 AND (nombre LIKE '%Capurro%' OR nombre LIKE '%Santi%');"

echo
echo "── DELETE id=60 ──"
sqlite3 "$DB" "DELETE FROM contactos WHERE id=60;"

echo
echo "── DESPUÉS ──"
sqlite3 -header "$DB" "SELECT id, nombre, whatsapp, email FROM contactos WHERE usuario_id=1 AND (nombre LIKE '%Capurro%' OR nombre LIKE '%Santi%');"
