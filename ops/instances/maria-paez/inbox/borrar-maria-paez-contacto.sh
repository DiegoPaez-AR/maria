#!/bin/bash
# El contacto MarIA Paez (id=74) en la libreta de Diego es Maria misma —
# no tiene sentido como contacto. Lo borro junto con su nota curada (si la
# tuviera) y logueo en eventos para auditoría.
set +e
set -a; . /root/secretaria/config/instances/maria-paez.conf; set +a

echo "═══ Estado actual del contacto 74 ═══"
sqlite3 -header -column "$MARIA_DB" "
SELECT id, nombre, whatsapp, email, visibilidad, substr(COALESCE(notas,''),1,80) AS notas, creado
FROM contactos
WHERE id = 74
"
echo ""
echo "Notas curadas asociadas (si las hay):"
sqlite3 -header -column "$MARIA_DB" "
SELECT id, contacto_id, length(nota) AS chars, substr(nota,1,100) AS excerpt
FROM notas_contacto
WHERE contacto_id = 74
"

echo ""
echo "═══ Aplicar borrado en transacción ═══"
sqlite3 "$MARIA_DB" <<'SQL'
BEGIN TRANSACTION;
DELETE FROM notas_contacto WHERE contacto_id = 74;
INSERT INTO eventos (timestamp, usuario_id, canal, direccion, cuerpo)
VALUES (CURRENT_TIMESTAMP, 1, 'sistema', 'interno', 'libreta: borrado contacto id=74 "MarIA Paez" (era Maria misma, no contacto válido)');
DELETE FROM contactos WHERE id = 74;
COMMIT;
SQL

echo ""
echo "═══ Verificación post-borrado ═══"
sqlite3 -header -column "$MARIA_DB" "SELECT id, nombre FROM contactos WHERE id = 74 OR nombre LIKE '%MarIA%' OR nombre LIKE '%Maria Paez%'"
echo ""
sqlite3 "$MARIA_DB" "SELECT 'Contactos del owner: ' || COUNT(*) FROM contactos WHERE usuario_id = 1"
