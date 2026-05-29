#!/bin/bash
# Borra el contacto basura 296 ("María Páez (sec. Diego)" con el numero de Hernan
# en la libreta de Hernan) que causaba la confusion de identidad. Audita por otros.
set -uo pipefail
cd /root/secretaria
cf=config/instances/maria-paez.conf
set -a; . "$cf"; set +a
DB="$MARIA_DB"

echo "=== ANTES: self-contactos (nombre Maria / numero 79043441) ==="
sqlite3 -header -column "$DB" "SELECT id,usuario_id,nombre,whatsapp,visibilidad FROM contactos WHERE nombre LIKE '%Mar_a P%' OR nombre LIKE '%sec. Diego%' OR nombre LIKE '%secretaria%' OR whatsapp LIKE '%79043441%';"

echo ""
echo "=== borrando id=296 ==="
sqlite3 "$DB" "DELETE FROM contactos WHERE id=296 AND usuario_id=2;"
echo "filas con id=296 ahora: $(sqlite3 "$DB" "SELECT COUNT(*) FROM contactos WHERE id=296;")"

echo ""
echo "=== DESPUES: re-auditoria (deberia quedar vacio) ==="
sqlite3 -header -column "$DB" "SELECT id,usuario_id,nombre,whatsapp FROM contactos WHERE nombre LIKE '%Mar_a P%' OR nombre LIKE '%sec. Diego%' OR nombre LIKE '%secretaria%' OR whatsapp LIKE '%79043441%';"
echo "(si no imprime filas → limpio)"
