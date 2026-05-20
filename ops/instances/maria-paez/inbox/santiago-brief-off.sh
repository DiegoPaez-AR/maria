#!/bin/bash
# Baja de Santiago Bignone del morning-brief: pidio 3 veces no recibirlo.
DB="${MARIA_DB:-/root/secretaria/state/maria-paez/db/maria.sqlite}"
echo "DB: $DB"
if ! sqlite3 "$DB" "SELECT brief_activo FROM usuarios LIMIT 1;" >/dev/null 2>&1; then
  echo "ERROR: columna brief_activo no existe todavia — abortando"
  exit 1
fi
echo "--- ANTES (todos los usuarios) ---"
sqlite3 -header -column "$DB" "SELECT id,nombre,brief_activo FROM usuarios WHERE activo=1 ORDER BY id;"
echo
echo "--- UPDATE Santiago Bignone ---"
sqlite3 "$DB" "UPDATE usuarios SET brief_activo=0, actualizado=CURRENT_TIMESTAMP WHERE nombre='Santiago Bignone'; SELECT 'filas afectadas: '||changes();"
echo
echo "--- DESPUES ---"
sqlite3 -header -column "$DB" "SELECT id,nombre,brief_activo FROM usuarios WHERE activo=1 ORDER BY id;"
