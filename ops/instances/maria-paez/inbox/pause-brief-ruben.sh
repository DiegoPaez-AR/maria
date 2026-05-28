#!/bin/bash
# Pausar el brief matutino de Rubén Ward (usuario #11).
# Diego lo pidió 27/05 via WA → Maria lo "confirmó" pero no había tool para terceros.
# Aplicamos el flag a mano. Vuelve a 1 cuando Diego pida reactivar.
set -e
cf=/root/secretaria/config/instances/maria-paez.conf
set -a; . "$cf"; set +a
DB="$MARIA_DB"

echo "=== antes ==="
sqlite3 -header -column "$DB" \
  "SELECT id, nombre, activo, brief_activo, brief_hora, brief_minuto FROM usuarios WHERE id=11;"

sqlite3 "$DB" "UPDATE usuarios SET brief_activo=0, actualizado=CURRENT_TIMESTAMP WHERE id=11 AND nombre='Rubén Ward';"

echo
echo "=== despues ==="
sqlite3 -header -column "$DB" \
  "SELECT id, nombre, activo, brief_activo, brief_hora, brief_minuto FROM usuarios WHERE id=11;"

# Cerrar pendiente #100 (ya cumplido)
sqlite3 "$DB" "UPDATE pendientes SET estado='hecho', actualizado=CURRENT_TIMESTAMP WHERE id=100;"
echo
echo "=== pendiente 100 ==="
sqlite3 -header -column "$DB" "SELECT id, estado, desc FROM pendientes WHERE id=100;"
