#!/bin/bash
# Diagnóstico del programado id=268: estado actual, intentos, contacto Fabio.
set -euo pipefail
cd /root/secretaria

DB="$MARIA_DB"
echo "── DB: $DB ──"

echo
echo "── programados id=268 (todo, no solo abiertos) ──"
sqlite3 -header -column "$DB" "SELECT id, estado, dueno, disparador, datetime(cuando,'localtime') as cuando, wa_cus, substr(coalesce(payload_json,''),1,80) as payload FROM programados WHERE id=268;"

echo
echo "── últimos 10 intentos/errores del 268 (tabla eventos o similar) ──"
sqlite3 "$DB" ".tables" | tr ' ' '\n' | grep -iE 'evento|log|intent|attempt' | head -10
echo "(tablas candidatas listadas arriba)"

echo
echo "── eventos asociados a 268 (últimos 5) ──"
sqlite3 -header -column "$DB" "SELECT datetime(ts,'localtime') as ts, tipo, substr(detalle,1,100) as detalle FROM eventos WHERE detalle LIKE '%id=268%' OR detalle LIKE '%programado 268%' ORDER BY ts DESC LIMIT 5;" 2>/dev/null || echo "(no se pudo)"

echo
echo "── contacto Fabio (post-cambio) ──"
sqlite3 -header -column "$DB" "SELECT id, nombre, wa_cus, email, datetime(actualizado,'localtime') as actualizado FROM contactos WHERE nombre LIKE '%Fabio%';" 2>/dev/null || \
  sqlite3 -header -column "$DB" "SELECT id, nombre, wa, email FROM contactos WHERE nombre LIKE '%Fabio%';" 2>/dev/null || \
  echo "(schema de contactos diferente)"

echo
echo "── ¿hay otros programados abiertos con wa_cus 549115218...  (el número viejo de Fabio)? ──"
sqlite3 -header -column "$DB" "SELECT id, estado, datetime(cuando,'localtime') as cuando, substr(coalesce(payload_json,''),1,60) as payload FROM programados WHERE wa_cus LIKE '%5491152189302%';"
