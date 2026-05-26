#!/bin/bash
set -uo pipefail
cd /root/secretaria
DB="$MARIA_DB"

echo "── schema programados ──"
sqlite3 "$DB" ".schema programados"

echo
echo "── row del id=268 (raw) ──"
sqlite3 -header "$DB" "SELECT * FROM programados WHERE id=268;"

echo
echo "── schema contactos ──"
sqlite3 "$DB" ".schema contactos"

echo
echo "── contacto Fabio ──"
sqlite3 -header "$DB" "SELECT * FROM contactos WHERE nombre LIKE '%abio%';"

echo
echo "── total programados (último por id) ──"
sqlite3 -header -column "$DB" "SELECT MAX(id) as max_id, COUNT(*) as total FROM programados;"
