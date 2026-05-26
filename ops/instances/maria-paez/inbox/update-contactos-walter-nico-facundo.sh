#!/bin/bash
set -uo pipefail
cd /root/secretaria
DB="$MARIA_DB"

echo "── ANTES ──"
sqlite3 -header "$DB" "
  SELECT id, usuario_id, nombre, whatsapp, email
  FROM contactos
  WHERE (usuario_id=1 AND (nombre LIKE '%Facundo%' OR nombre LIKE '%Walter%' OR nombre LIKE '%Kosinski%'))
  ORDER BY id;
"
echo
sqlite3 -header "$DB" "SELECT id, nombre, wa_cus, email FROM usuarios WHERE nombre IN ('Facundo Diaz','Walter Vera','Nicolas Kosinski');"

echo
echo "── 1. Crear Walter Vera en libreta de Diego (usuario_id=1) ──"
sqlite3 "$DB" "
  INSERT INTO contactos (usuario_id, nombre, whatsapp, email, visibilidad, creado, actualizado)
  VALUES (1, 'Walter Vera', '5491138433288@c.us', 'wvera@froneus.com', 'privada', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
" && echo "  ✓ insertado"

echo "── 2. Crear Nicolás Kosinski en libreta de Diego (usuario_id=1) ──"
sqlite3 "$DB" "
  INSERT INTO contactos (usuario_id, nombre, whatsapp, email, visibilidad, creado, actualizado)
  VALUES (1, 'Nicolás Kosinski', '5491150080522@c.us', 'nkosinski@froneus.com', 'privada', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
" && echo "  ✓ insertado"

echo "── 3. Borrar Facundo Diaz legacy (id=93, sin whatsapp, email viejo) ──"
sqlite3 "$DB" "DELETE FROM contactos WHERE id=93;"
echo "  ✓ borrado"

echo "── 4. Actualizar Facundo Martin Diaz (id=276) — email = f@q99.ai ──"
sqlite3 "$DB" "UPDATE contactos SET email='f@q99.ai', actualizado=CURRENT_TIMESTAMP WHERE id=276;"
echo "  ✓ updated"

echo "── 5. Actualizar usuario Facundo Diaz (id=14) — wa_cus + email ──"
sqlite3 "$DB" "UPDATE usuarios SET wa_cus='14242831584@c.us', email='f@q99.ai' WHERE id=14;"
echo "  ✓ updated"

echo
echo "── DESPUÉS — contactos ──"
sqlite3 -header "$DB" "
  SELECT id, usuario_id, nombre, whatsapp, email
  FROM contactos
  WHERE (usuario_id=1 AND (nombre LIKE '%Facundo%' OR nombre LIKE '%Walter%' OR nombre LIKE '%Kosinski%'))
  ORDER BY id;
"
echo
echo "── DESPUÉS — usuarios ──"
sqlite3 -header "$DB" "SELECT id, nombre, wa_cus, email FROM usuarios WHERE nombre IN ('Facundo Diaz','Walter Vera','Nicolas Kosinski');"
