#!/bin/bash
cd /root/secretaria
DB="$MARIA_DB"

echo "=== usuarios target ==="
sqlite3 -header "$DB" "SELECT id, nombre, wa_lid, wa_cus, email FROM usuarios WHERE nombre IN ('Walter Vera','Nicolas Kosinski','Facundo Diaz');"

echo
echo "=== contactos relacionados (cualquier libreta) ==="
sqlite3 -header "$DB" "
  SELECT c.id, c.usuario_id, u.nombre as libreta_de, c.nombre, c.whatsapp, c.email, c.visibilidad
  FROM contactos c
  LEFT JOIN usuarios u ON u.id = c.usuario_id
  WHERE c.nombre LIKE '%Walter%' OR c.nombre LIKE '%Vera%'
     OR c.nombre LIKE '%Kosinski%' OR c.nombre LIKE '%Nicolas K%' OR c.nombre LIKE '%Nicolás K%'
     OR c.nombre LIKE '%Facundo%' OR c.nombre LIKE '%Martin Diaz%'
  ORDER BY c.usuario_id, c.nombre;
"
