#!/bin/bash
# Diagnóstico completo de la libreta de contactos para encontrar
# duplicados, nombres raros, registros sin datos útiles.
set +e
set -a; . /root/secretaria/config/instances/maria-paez.conf; set +a

echo "═══ 1) Contactos con nombres sospechosos (espacios extraños, muy cortos, etc.) ═══"
sqlite3 -header -column "$MARIA_DB" "
SELECT id, usuario_id, nombre,
       COALESCE(whatsapp,'') AS wa,
       COALESCE(email,'') AS email,
       COALESCE(notas,'') AS notas,
       visibilidad
FROM contactos
WHERE
  nombre LIKE '% %  %'  -- múltiples espacios
  OR nombre GLOB '*[A-Z] [A-Z]*'  -- letras separadas por espacios
  OR length(nombre) <= 3
  OR nombre LIKE '%?%'  -- signos raros
ORDER BY nombre
"

echo ""
echo "═══ 2) Posibles duplicados por nombre similar (mismas primeras 6 letras) ═══"
sqlite3 -header -column "$MARIA_DB" "
SELECT lower(substr(replace(nombre,' ',''),1,6)) AS clave, GROUP_CONCAT(id) AS ids, GROUP_CONCAT(nombre, ' | ') AS nombres
FROM contactos
WHERE usuario_id = 1
GROUP BY clave
HAVING COUNT(*) > 1
ORDER BY clave
"

echo ""
echo "═══ 3) Posibles duplicados por whatsapp ═══"
sqlite3 -header -column "$MARIA_DB" "
SELECT whatsapp, GROUP_CONCAT(id) AS ids, GROUP_CONCAT(nombre, ' | ') AS nombres
FROM contactos
WHERE whatsapp IS NOT NULL AND whatsapp != ''
GROUP BY whatsapp
HAVING COUNT(*) > 1
"

echo ""
echo "═══ 4) Posibles duplicados por email ═══"
sqlite3 -header -column "$MARIA_DB" "
SELECT email, GROUP_CONCAT(id) AS ids, GROUP_CONCAT(nombre, ' | ') AS nombres
FROM contactos
WHERE email IS NOT NULL AND email != ''
GROUP BY email
HAVING COUNT(*) > 1
"

echo ""
echo "═══ 5) Contactos sin whatsapp NI email (huérfanos) ═══"
sqlite3 -header -column "$MARIA_DB" "
SELECT id, usuario_id, nombre, substr(COALESCE(notas,''),1,80) AS notas
FROM contactos
WHERE (whatsapp IS NULL OR whatsapp='') AND (email IS NULL OR email='')
ORDER BY id
"

echo ""
echo "═══ 6) Casos específicos mencionados: 'FC' y 'F A R I N E L L I' ═══"
sqlite3 -header -column "$MARIA_DB" "
SELECT id, usuario_id, nombre, whatsapp, email, substr(COALESCE(notas,''),1,80) AS notas, creado
FROM contactos
WHERE nombre IN ('FC', 'F A R I N E L L I', 'Farinelli', 'Farinelli Arroyo')
   OR nombre LIKE '%Farinelli%'
   OR nombre LIKE '%FC%'
ORDER BY id
"

echo ""
echo "═══ 7) Notas curadas asociadas a cada contacto sospechoso ═══"
sqlite3 -header -column "$MARIA_DB" "
SELECT n.id AS nota_id, n.contacto_id, c.nombre AS contacto, substr(n.nota,1,140) AS nota_excerpt
FROM notas_contacto n JOIN contactos c ON c.id = n.contacto_id
WHERE c.nombre IN ('FC', 'F A R I N E L L I', 'Farinelli Arroyo')
   OR c.nombre LIKE '%Farinelli%'
ORDER BY n.id
"

echo ""
echo "═══ 8) Tamaño total de libreta (Diego) ═══"
sqlite3 "$MARIA_DB" "SELECT COUNT(*) AS total FROM contactos WHERE usuario_id = 1"
