#!/bin/bash
set +e
source /root/secretaria/config/instances/maria-paez.conf 2>/dev/null
DB="${MARIA_DB:-/root/secretaria/state/maria-paez/db/maria.sqlite}"

echo "═══ Schema eventos ═══"
sqlite3 "$DB" ".schema eventos" | head -10

echo ""
echo "═══ Schema contactos ═══"
sqlite3 "$DB" ".schema contactos" | head -20

echo ""
echo "═══ Mensajes entrantes del owner (Diego) ULTIMAS 4h con mencion de Enrique o nro ═══"
sqlite3 -header "$DB" "SELECT datetime(timestamp), substr(cuerpo,1,400) FROM eventos WHERE timestamp >= datetime('now','-4 hours') AND direccion='entrante' AND (cuerpo LIKE '%nrique%' OR cuerpo LIKE '%sosa%' OR cuerpo LIKE '%Sosa%' OR cuerpo LIKE '%globalnet%' OR cuerpo LIKE '%959899%' OR cuerpo LIKE '%59899%' OR cuerpo LIKE '%4302%') ORDER BY timestamp ASC LIMIT 30;"

echo ""
echo "═══ Fila completa de Enrique en usuarios ═══"
sqlite3 "$DB" "SELECT * FROM usuarios WHERE id=12;"

echo ""
echo "═══ Fila completa Enrique en contactos ═══"
sqlite3 "$DB" "SELECT * FROM contactos WHERE LOWER(nombre) LIKE '%nrique%';"

echo ""
echo "═══ Acción crear_usuario completa (cuerpo full) ═══"
sqlite3 "$DB" "SELECT datetime(timestamp), cuerpo FROM eventos WHERE timestamp >= datetime('now','-4 hours') AND canal='sistema' AND cuerpo LIKE '%crear_usuario%' LIMIT 5;"
