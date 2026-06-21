#!/bin/bash
set +e
DB="${MARIA_DB:-/root/secretaria/state/maria-paez/db/maria.sqlite}"
CONF=/root/secretaria/config/instances/maria-paez.conf
echo "=== overrides de recordatorios en el .conf ==="
grep -iE "RECORDATORIO|TAREA|CONSULTA" "$CONF" 2>/dev/null || echo "(ninguno → usa defaults: consulta 2h/3h, tarea 24h/24h, loop 30min)"
echo; echo "=== recordatorios enviados a Diego, últimos 3 días (tag + hora) — vía pm2 log ==="
pm2 logs maria-paez --lines 600 --nostream 2>/dev/null | grep -iE "recordatorios/Diego|tareas? abiertas|Te debo consulta" | tail -30
echo; echo "=== mensajes 'tareas abiertas' salientes en la DB (frecuencia real) ==="
sqlite3 -cmd ".mode list" "$DB" "SELECT substr(timestamp,1,16)||' | '||substr(cuerpo,1,60) FROM eventos WHERE direccion='saliente' AND (cuerpo LIKE '%tareas%abiertas%' OR cuerpo LIKE '%tarea abiertas%' OR cuerpo LIKE '%Te debo consulta%') ORDER BY timestamp DESC LIMIT 20;" 2>&1
