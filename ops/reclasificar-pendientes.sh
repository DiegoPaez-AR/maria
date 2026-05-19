#!/bin/bash
# Reclasificación one-off de pendientes pre-migración dueno/disparador.
# Idempotente: solo updatea si el pendiente sigue abierto y matchea el desc esperado.
#
# La migración automática mapea meta.tipo='consulta' → disparador='respuesta_usuario'.
# El único caso que no encaja con ese default es el 75 (tarea de Maria con trigger
# externo de Analia). El resto queda bien con los defaults.
#
# Si nuevos pendientes aparecieron desde el snapshot del 2026-05-19 09:56 AR,
# este script NO los toca — están bajo el régimen nuevo desde el deploy.

set -e
DB="${MARIA_DB:-/root/secretaria/state/maria-paez/db/maria.sqlite}"

echo "═══ DB en uso ═══"
echo "$DB"
ls -la "$DB" 2>/dev/null

echo
echo "═══ Pendientes abiertos ANTES ═══"
sqlite3 -header -column "$DB" \
  "SELECT id, dueno, disparador, COALESCE(recordar_desde,'') AS recordar_desde, substr(desc,1,80) AS desc FROM pendientes WHERE estado='abierto' ORDER BY id;"

echo
echo "═══ Reclasificación id=75 → (maria, trigger_externo) ═══"
sqlite3 "$DB" "
UPDATE pendientes
   SET dueno='maria', disparador='trigger_externo'
 WHERE id=75
   AND estado='abierto'
   AND desc LIKE 'Cuando Analia Frangi%';
"

echo
echo "═══ Pendientes abiertos DESPUÉS ═══"
sqlite3 -header -column "$DB" \
  "SELECT id, dueno, disparador, COALESCE(recordar_desde,'') AS recordar_desde, substr(desc,1,80) AS desc FROM pendientes WHERE estado='abierto' ORDER BY id;"

echo
echo "═══ DONE ═══"
