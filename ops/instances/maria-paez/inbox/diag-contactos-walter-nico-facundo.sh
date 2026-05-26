#!/bin/bash
set -uo pipefail
cd /root/secretaria
DB="$MARIA_DB"

echo "── usuarios target (de la tabla usuarios) ──"
sqlite3 -header -column "$DB" "
  SELECT id, nombre, wa_lid, wa_cus, email, calendar_id
  FROM usuarios
  WHERE nombre IN ('Walter Vera','Nicolas Kosinski','Facundo Diaz');
"

echo
echo "── contactos con nombre que matchee Walter / Nicolas / Facundo (todas las libretas) ──"
sqlite3 -header -column "$DB" "
  SELECT c.id, c.usuario_id, u.nombre as libreta_de, c.nombre, c.whatsapp, c.email, c.visibilidad, datetime(c.actualizado,'localtime') as actualizado
  FROM contactos c
  LEFT JOIN usuarios u ON u.id = c.usuario_id
  WHERE c.nombre LIKE '%Walter%'
     OR c.nombre LIKE '%Vera%'
     OR c.nombre LIKE '%Nicol%Kosinski%'
     OR c.nombre LIKE '%Kosinski%'
     OR c.nombre LIKE '%Facundo%'
     OR c.nombre LIKE '%Martin Diaz%'
  ORDER BY c.usuario_id, c.nombre;
"
