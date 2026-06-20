#!/bin/bash
set +e
DB="${MARIA_DB:-/root/secretaria/state/maria-paez/db/maria.sqlite}"
WA="5491161549534@c.us"
echo "=== ahora (UTC) ==="; date -u +%F\ %T
echo; echo "=== ultimas acciones enviar_wa (ok/fallidas) ==="
sqlite3 -cmd ".mode list" "$DB" "SELECT substr(timestamp,1,16)||' | '||cuerpo FROM eventos WHERE cuerpo LIKE '%enviar_wa%' OR cuerpo LIKE '%Acción desconocida%' OR cuerpo LIKE '%descono%' ORDER BY timestamp DESC LIMIT 8;" 2>&1
echo; echo "=== TODO evento WA hacia Alfonso ($WA) [saliente real = prueba de envio] ==="
sqlite3 -cmd ".mode list" "$DB" "SELECT substr(timestamp,1,16)||' | '||canal||'/'||direccion||' | de='||IFNULL(de,'') FROM eventos WHERE de=\"$WA\" ORDER BY timestamp DESC LIMIT 10;" 2>&1
echo; echo "=== eventos sobre Alfonso ultimos (cualquier direccion) ==="
sqlite3 -cmd ".mode list" "$DB" "SELECT substr(timestamp,1,16)||' | '||canal||'/'||direccion||' | '||substr(cuerpo,1,110) FROM eventos WHERE (cuerpo LIKE '%5491161549534%' OR cuerpo LIKE '%Alfonso%') AND timestamp >= '2026-06-20 20:30' ORDER BY timestamp DESC LIMIT 12;" 2>&1
echo; echo "=== log pm2 reciente (envio/accion/Alfonso/error) ==="
pm2 logs maria-paez --lines 120 --nostream 2>/dev/null | grep -iE "enviar_wa|→3ro|acciones/|Alfonso|enviarWADirecto|No pude mandar|descono|getNumberId|No LID|161549534" | tail -20
