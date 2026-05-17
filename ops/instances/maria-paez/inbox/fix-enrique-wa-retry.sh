#!/bin/bash
# Retry: corregir wa de Enrique. Anterior se perdió por race en cron.
set +e
DB="/root/secretaria/state/maria-paez/db/maria.sqlite"
NUEVO="59899643028@c.us"

echo "═══ ANTES ═══"
sqlite3 -header -column "$DB" "SELECT 'usuarios' AS tabla, id, nombre, wa_cus FROM usuarios WHERE id=12 UNION ALL SELECT 'contactos' AS tabla, id, nombre, whatsapp FROM contactos WHERE id=209;"

echo ""
echo "═══ Pre-check: ¿$NUEVO ya existe en otra fila? ═══"
sqlite3 "$DB" "SELECT 'usuarios:' || id, nombre FROM usuarios WHERE wa_cus = '$NUEVO' AND id != 12 UNION ALL SELECT 'contactos:' || id, nombre FROM contactos WHERE whatsapp = '$NUEVO' AND id != 209;"

echo ""
echo "═══ UPDATE ═══"
sqlite3 "$DB" "UPDATE usuarios  SET wa_cus = '$NUEVO', actualizado = CURRENT_TIMESTAMP WHERE id = 12; SELECT 'usuarios_changes=' || changes();"
sqlite3 "$DB" "UPDATE contactos SET whatsapp = '$NUEVO', actualizado = CURRENT_TIMESTAMP WHERE id = 209; SELECT 'contactos_changes=' || changes();"

echo ""
echo "═══ DESPUÉS ═══"
sqlite3 -header -column "$DB" "SELECT 'usuarios' AS tabla, id, nombre, wa_cus, datetime(actualizado) FROM usuarios WHERE id=12 UNION ALL SELECT 'contactos' AS tabla, id, nombre, whatsapp, datetime(actualizado) FROM contactos WHERE id=209;"
