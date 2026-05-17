#!/bin/bash
# Limpieza de duplicados en la libreta de contactos del owner (usuario_id=1).
# Para cada par (canonico, duplicado):
#   1. Si ambos tienen nota curada, concatenamos al canónico y borramos la del duplicado.
#   2. Si solo el duplicado tiene nota, la movemos al canónico (UPDATE).
#   3. Borramos el contacto duplicado.
# Todo en transacción para que sea atómico.
set +e
set -a; . /root/secretaria/config/instances/maria-paez.conf; set +a

# Pares: "canonico:duplicado"
PARES=(
  "32:33"    # Diego Paez | Diego
  "86:223"   # Nicolás Kosinski (con tilde)
  "87:225"   # Walter Vera
  "108:107"  # Rodrigo Paez Canosa (apellido completo) vs Rodrigo Canosa
  "24:222"   # Poch Burgers
  "96:105"   # Natali Funez
  "79:201"   # Mariela Nigro
  "65:64"    # Marcos (real) vs FC (auto-agregado)
  "26:42"    # Farinelli Arroyo (con @c.us) vs F A R I N E L L I (con @lid)
)

echo "═══ Estado inicial — pares a mergear ═══"
for par in "${PARES[@]}"; do
  CAN="${par%%:*}"; DUP="${par##*:}"
  sqlite3 -separator ' | ' "$MARIA_DB" "SELECT 'CAN(' || id || '): ' || nombre || ' [' || COALESCE(whatsapp,'sin-wa') || '] notas_curadas=' || (SELECT COUNT(*) FROM notas_contacto WHERE contacto_id=c.id) FROM contactos c WHERE id=$CAN"
  sqlite3 -separator ' | ' "$MARIA_DB" "SELECT 'DUP(' || id || '): ' || nombre || ' [' || COALESCE(whatsapp,'sin-wa') || '] notas_curadas=' || (SELECT COUNT(*) FROM notas_contacto WHERE contacto_id=c.id) FROM contactos c WHERE id=$DUP"
  echo ""
done

echo "═══ Aplicando merges (transacción) ═══"
sqlite3 "$MARIA_DB" <<'SQL'
BEGIN TRANSACTION;

-- Helper: para cada par, mover datos del duplicado al canónico si faltan.
-- Repetimos el patrón para cada par. SQLite no tiene loops, así que va explícito.

-- Función inline: si el canónico tiene NULL en algún campo y el duplicado tiene valor, copiar.
-- Lo hacemos con UPDATE selectivos.

-- 1) Diego Paez (32) | Diego (33)
UPDATE contactos SET email = COALESCE(NULLIF(email,''), (SELECT email FROM contactos WHERE id=33)) WHERE id=32 AND (email IS NULL OR email='');
UPDATE contactos SET notas = COALESCE(NULLIF(notas,''), (SELECT notas FROM contactos WHERE id=33)) WHERE id=32 AND (notas IS NULL OR notas='');

-- 2) Nicolás Kosinski (86) | Nicolas Kosinski (223)
UPDATE contactos SET notas = COALESCE(NULLIF(notas,''), (SELECT notas FROM contactos WHERE id=223)) WHERE id=86 AND (notas IS NULL OR notas='');

-- 3) Walter Vera (87) | Walter Vera (225) — ambos idénticos, nada que copiar
-- 4) Rodrigo Paez Canosa (108) | Rodrigo Canosa (107) — nada que copiar
-- 5) Poch Burgers (24) | Poch (222) — nada
-- 6) Natali Funez (96) | (105) — nada
-- 7) Mariela Nigro (79) | (201) — el 201 tiene email, copiar si falta
UPDATE contactos SET email = COALESCE(NULLIF(email,''), (SELECT email FROM contactos WHERE id=201)) WHERE id=79 AND (email IS NULL OR email='');

-- 8) Marcos (65) | FC (64) — copiar notas del FC al Marcos si faltan
UPDATE contactos SET notas = COALESCE(NULLIF(notas,''), (SELECT notas FROM contactos WHERE id=64)) WHERE id=65 AND (notas IS NULL OR notas='');

-- 9) Farinelli Arroyo (26) | F A R I N E L L I (42) — copiar notas
UPDATE contactos SET notas = COALESCE(NULLIF(notas,''), (SELECT notas FROM contactos WHERE id=42)) WHERE id=26 AND (notas IS NULL OR notas='');

-- Mover notas_contacto del duplicado al canónico.
-- Si el canónico ya tiene una nota (conflict UNIQUE), concatenamos la del duplicado y borramos.
-- Si no, simplemente cambiamos contacto_id.

-- Pattern: para cada par, primero CONCATENAR si hay conflict, después UPDATE simple.
-- Para mantener simple usamos un approach en dos pasos por par:

-- (1) Si el canónico ya tiene nota Y el duplicado también: concatenar al canónico, borrar la del duplicado
-- (2) Si solo el duplicado tiene: UPDATE contacto_id

-- 1) Diego: el duplicado 33 no tiene nota, no hay conflict
UPDATE notas_contacto SET contacto_id=32 WHERE contacto_id=33 AND NOT EXISTS (SELECT 1 FROM notas_contacto WHERE contacto_id=32 AND usuario_id=notas_contacto.usuario_id);
-- 2) Nicolás
UPDATE notas_contacto SET nota = nota || char(10) || char(10) || '--- nota del duplicado borrado (id ' || (SELECT id FROM notas_contacto WHERE contacto_id=223 LIMIT 1) || '):' || char(10) || (SELECT nota FROM notas_contacto WHERE contacto_id=223 LIMIT 1) WHERE contacto_id=86 AND EXISTS (SELECT 1 FROM notas_contacto WHERE contacto_id=223);
DELETE FROM notas_contacto WHERE contacto_id=223 AND EXISTS (SELECT 1 FROM notas_contacto WHERE contacto_id=86);
UPDATE notas_contacto SET contacto_id=86 WHERE contacto_id=223;
-- 3) Walter
UPDATE notas_contacto SET nota = nota || char(10) || char(10) || '--- duplicado:' || char(10) || (SELECT nota FROM notas_contacto WHERE contacto_id=225 LIMIT 1) WHERE contacto_id=87 AND EXISTS (SELECT 1 FROM notas_contacto WHERE contacto_id=225);
DELETE FROM notas_contacto WHERE contacto_id=225 AND EXISTS (SELECT 1 FROM notas_contacto WHERE contacto_id=87);
UPDATE notas_contacto SET contacto_id=87 WHERE contacto_id=225;
-- 4) Rodrigo
UPDATE notas_contacto SET nota = nota || char(10) || char(10) || '--- duplicado:' || char(10) || (SELECT nota FROM notas_contacto WHERE contacto_id=107 LIMIT 1) WHERE contacto_id=108 AND EXISTS (SELECT 1 FROM notas_contacto WHERE contacto_id=107);
DELETE FROM notas_contacto WHERE contacto_id=107 AND EXISTS (SELECT 1 FROM notas_contacto WHERE contacto_id=108);
UPDATE notas_contacto SET contacto_id=108 WHERE contacto_id=107;
-- 5) Poch
UPDATE notas_contacto SET nota = nota || char(10) || char(10) || '--- duplicado:' || char(10) || (SELECT nota FROM notas_contacto WHERE contacto_id=222 LIMIT 1) WHERE contacto_id=24 AND EXISTS (SELECT 1 FROM notas_contacto WHERE contacto_id=222);
DELETE FROM notas_contacto WHERE contacto_id=222 AND EXISTS (SELECT 1 FROM notas_contacto WHERE contacto_id=24);
UPDATE notas_contacto SET contacto_id=24 WHERE contacto_id=222;
-- 6) Natali
UPDATE notas_contacto SET nota = nota || char(10) || char(10) || '--- duplicado:' || char(10) || (SELECT nota FROM notas_contacto WHERE contacto_id=105 LIMIT 1) WHERE contacto_id=96 AND EXISTS (SELECT 1 FROM notas_contacto WHERE contacto_id=105);
DELETE FROM notas_contacto WHERE contacto_id=105 AND EXISTS (SELECT 1 FROM notas_contacto WHERE contacto_id=96);
UPDATE notas_contacto SET contacto_id=96 WHERE contacto_id=105;
-- 7) Mariela
UPDATE notas_contacto SET nota = nota || char(10) || char(10) || '--- duplicado:' || char(10) || (SELECT nota FROM notas_contacto WHERE contacto_id=201 LIMIT 1) WHERE contacto_id=79 AND EXISTS (SELECT 1 FROM notas_contacto WHERE contacto_id=201);
DELETE FROM notas_contacto WHERE contacto_id=201 AND EXISTS (SELECT 1 FROM notas_contacto WHERE contacto_id=79);
UPDATE notas_contacto SET contacto_id=79 WHERE contacto_id=201;
-- 8) Marcos: tiene nota en FC (64), no en Marcos (65) → mover directo
UPDATE notas_contacto SET nota = nota || char(10) || char(10) || '--- duplicado:' || char(10) || (SELECT nota FROM notas_contacto WHERE contacto_id=64 LIMIT 1) WHERE contacto_id=65 AND EXISTS (SELECT 1 FROM notas_contacto WHERE contacto_id=64);
DELETE FROM notas_contacto WHERE contacto_id=64 AND EXISTS (SELECT 1 FROM notas_contacto WHERE contacto_id=65);
UPDATE notas_contacto SET contacto_id=65 WHERE contacto_id=64;
-- 9) Farinelli
UPDATE notas_contacto SET nota = nota || char(10) || char(10) || '--- duplicado:' || char(10) || (SELECT nota FROM notas_contacto WHERE contacto_id=42 LIMIT 1) WHERE contacto_id=26 AND EXISTS (SELECT 1 FROM notas_contacto WHERE contacto_id=42);
DELETE FROM notas_contacto WHERE contacto_id=42 AND EXISTS (SELECT 1 FROM notas_contacto WHERE contacto_id=26);
UPDATE notas_contacto SET contacto_id=26 WHERE contacto_id=42;

-- Loguear las migraciones en eventos para auditoría
INSERT INTO eventos (timestamp, usuario_id, canal, direccion, cuerpo)
VALUES (CURRENT_TIMESTAMP, 1, 'sistema', 'interno', 'libreta: merge de duplicados — pares mergeados: 32←33, 86←223, 87←225, 108←107, 24←222, 96←105, 79←201, 65←64, 26←42');

-- BORRAR los duplicados
DELETE FROM contactos WHERE id IN (33, 223, 225, 107, 222, 105, 201, 64, 42);

COMMIT;
SQL

echo ""
echo "═══ Resultado: contactos restantes con esos nombres ═══"
sqlite3 -header -column "$MARIA_DB" "
SELECT id, nombre, whatsapp, email, substr(COALESCE(notas,''),1,60) AS notas
FROM contactos
WHERE id IN (32, 86, 87, 108, 24, 96, 79, 65, 26)
ORDER BY id
"

echo ""
echo "═══ Notas curadas migradas (con concatenación si hubo) ═══"
sqlite3 -header -column "$MARIA_DB" "
SELECT n.id AS nota_id, c.id AS contacto_id, c.nombre, length(n.nota) AS nota_chars, substr(n.nota,1,100) AS excerpt
FROM notas_contacto n JOIN contactos c ON c.id = n.contacto_id
WHERE c.id IN (32, 86, 87, 108, 24, 96, 79, 65, 26)
ORDER BY c.id
"

echo ""
echo "═══ Verificar que ya no quedan duplicados por wa+email ═══"
sqlite3 -header -column "$MARIA_DB" "
SELECT whatsapp, email, GROUP_CONCAT(nombre, ' | ') AS nombres
FROM contactos WHERE usuario_id = 1
GROUP BY whatsapp, email
HAVING COUNT(*) > 1
"

echo ""
echo "═══ Verificar tamaño final ═══"
sqlite3 "$MARIA_DB" "SELECT 'Contactos del owner: ' || COUNT(*) FROM contactos WHERE usuario_id = 1"

echo ""
echo "═══ Investigar 'MarIA Paez' (74) — eventos con su wa ═══"
sqlite3 -header -column "$MARIA_DB" "
SELECT id, timestamp, canal, direccion, substr(de,1,30) AS de, substr(cuerpo,1,80) AS cuerpo
FROM eventos
WHERE de = '5491179043441@c.us' OR nombre = 'MarIA Paez'
ORDER BY id DESC LIMIT 5
"
