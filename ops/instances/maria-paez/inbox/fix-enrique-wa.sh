#!/bin/bash
# Corregir el wa de Enrique Sosa.
# Owner pasó: +598 99 643 028 (Uruguay).
# - usuarios.id=12 wa_cus: 54959899643028@c.us → 59899643028@c.us
# - contactos.id=209 whatsapp: 54959899643028@c.us → 59899643028@c.us
set +e
source /root/secretaria/config/instances/maria-paez.conf 2>/dev/null
DB="${MARIA_DB:-/root/secretaria/state/maria-paez/db/maria.sqlite}"

NUEVO="59899643028@c.us"
echo "═══ ANTES ═══"
sqlite3 -header -column "$DB" "SELECT 'usuarios' AS tabla, id, nombre, wa_cus FROM usuarios WHERE id=12 UNION ALL SELECT 'contactos' AS tabla, id, nombre, whatsapp AS wa_cus FROM contactos WHERE id=209;"

echo ""
echo "═══ Verificación: ¿alguien más tiene $NUEVO? ═══"
sqlite3 -header -column "$DB" "SELECT 'usuarios' AS tabla, id, nombre FROM usuarios WHERE wa_cus = '$NUEVO' OR wa_lid = '$NUEVO' UNION ALL SELECT 'contactos' AS tabla, id, nombre FROM contactos WHERE whatsapp = '$NUEVO';"

echo ""
echo "═══ UPDATE ═══"
sqlite3 "$DB" "
UPDATE usuarios  SET wa_cus = '$NUEVO', actualizado = CURRENT_TIMESTAMP WHERE id = 12;
UPDATE contactos SET whatsapp = '$NUEVO', actualizado = CURRENT_TIMESTAMP WHERE id = 209;
SELECT changes();
"
echo ""

echo "═══ DESPUÉS ═══"
sqlite3 -header -column "$DB" "SELECT 'usuarios' AS tabla, id, nombre, wa_cus FROM usuarios WHERE id=12 UNION ALL SELECT 'contactos' AS tabla, id, nombre, whatsapp AS wa_cus FROM contactos WHERE id=209;"
echo ""
echo "═══ DONE ═══"
