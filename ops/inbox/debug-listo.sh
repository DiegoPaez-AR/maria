#!/bin/bash
set +e
DB=/root/secretaria/db/maria.sqlite
echo "── eventos WA hoy con FARINELLI / Diego / 'listo' ──"
sqlite3 -header -column "$DB" "
SELECT id, timestamp, direccion, COALESCE(de,'') AS de, substr(COALESCE(cuerpo,''),1,100) AS cuerpo
FROM eventos
WHERE canal='whatsapp'
  AND timestamp >= datetime('now','-12 hours')
  AND (de LIKE '%2227886%' OR cuerpo LIKE '%arinelli%' OR cuerpo = 'listo' OR cuerpo LIKE 'listo %' OR cuerpo LIKE '% listo' OR cuerpo LIKE '% listo %')
ORDER BY id DESC
LIMIT 40;
"
echo
echo "── log pm2 desde 12:50 hasta 13:30 ──"
pm2 logs maria --lines 3000 --nostream 2>&1 | grep -E '2026-05-08 (12:5|13:[012])' | head -80
