#!/usr/bin/env bash
# Limpia el estado FSM colgado del thread unknown-flow con Farinelli
# (222788661055558@lid) que quedó del intento pre-deploy de las 17:36 ART.
#
# Con ese estado presente, el próximo mensaje de Farinelli saltearía el LLM
# pre-pass nuevo y caería al FSM legacy (matcheo por nombre de usuario).
# Lo queremos borrar para que cuando Farinelli mande el menú, el nuevo
# clasificador lo vea y lo rutee como tercero_de_usuario.
set -u

DB=/root/secretaria/db/maria.sqlite

echo "=== antes ==="
sqlite3 -header -column "$DB" "
  SELECT usuario_id, clave, actualizado
  FROM estado_usuario
  WHERE clave LIKE 'unknown:%' OR clave LIKE 'unknown_pending:%';
"

echo
echo "=== borrar unknown:whatsapp:222788661055558@lid ==="
sqlite3 "$DB" "
  DELETE FROM estado_usuario
  WHERE clave = 'unknown:whatsapp:222788661055558@lid';
"
echo "(borrado)"

echo
echo "=== después ==="
sqlite3 -header -column "$DB" "
  SELECT usuario_id, clave, actualizado
  FROM estado_usuario
  WHERE clave LIKE 'unknown:%' OR clave LIKE 'unknown_pending:%';
"
