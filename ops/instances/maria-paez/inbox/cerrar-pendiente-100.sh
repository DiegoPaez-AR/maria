#!/bin/bash
# Cerrar pendiente #100 (pausar brief Rubén Ward) — ya cumplido (brief_activo=0).
# El intento previo falló: usó estado='hecho' (inválido) y columna 'actualizado' (inexistente).
# Estados válidos: abierto/cerrado/cancelado. Cierre correcto con estado='cerrado' + cerrado=CURRENT_TIMESTAMP.
set -uo pipefail
cf=/root/secretaria/config/instances/maria-paez.conf
set -a; . "$cf"; set +a
DB="$MARIA_DB"

echo "=== antes ==="
sqlite3 -header -column "$DB" "SELECT id, estado, cerrado, desc FROM pendientes WHERE id=100;"

sqlite3 "$DB" "UPDATE pendientes SET estado='cerrado', cerrado=CURRENT_TIMESTAMP WHERE id=100;"

echo
echo "=== despues ==="
sqlite3 -header -column "$DB" "SELECT id, estado, cerrado, desc FROM pendientes WHERE id=100;"

echo
echo "=== pendientes que siguen abiertos ==="
sqlite3 -header -column "$DB" "SELECT id, date(creado) AS creado, dueno, desc FROM pendientes WHERE estado='abierto' ORDER BY id;"
