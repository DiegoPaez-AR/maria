#!/bin/bash
DB=/root/secretaria/state/maria-paez/db/maria.sqlite
echo "=== DB: $DB ==="
ls -la "$DB" 2>&1
echo "=== TABLAS ==="
sqlite3 "$DB" ".tables"
echo "=== PENDIENTE 111 (full) ==="
sqlite3 -header "$DB" "SELECT * FROM pendientes WHERE id=111;"
echo "=== EVENTOS mencionando Leandro/Groisman ==="
sqlite3 "$DB" "SELECT id, creado, tipo, substr(detalle,1,400) FROM eventos WHERE detalle LIKE '%eandro%' OR detalle LIKE '%roisman%' ORDER BY id;"
echo "=== Buscar tabla de emails/mensajes ==="
sqlite3 "$DB" ".schema" | grep -iE "CREATE TABLE" 
