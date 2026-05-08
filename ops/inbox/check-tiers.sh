#!/bin/bash
set +e
DB=/root/secretaria/db/maria.sqlite

echo "── usuarios y su calendar_acceso ──"
sqlite3 -header -column "$DB" "
SELECT id, nombre, rol,
       COALESCE(email,'(sin email)') AS email,
       COALESCE(calendar_id,'(sin calendar_id)') AS calendar_id,
       calendar_acceso,
       activo
FROM usuarios
ORDER BY id;
"
echo
echo "── últimos cambios detectados por calendar-watch (eventos sistema) ──"
sqlite3 -header -column "$DB" "
SELECT timestamp, usuario_id, substr(cuerpo,1,80) AS cuerpo
FROM eventos
WHERE canal='sistema'
  AND cuerpo LIKE '%calendar_acceso%'
ORDER BY id DESC
LIMIT 20;
"
echo
echo "── log fresh con líneas calendar-watch ──"
pm2 logs maria --lines 1500 --nostream 2>&1 | grep -E 'calendar-watch' | tail -20
