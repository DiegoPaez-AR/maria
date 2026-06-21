#!/bin/bash
set +e
DB="${MARIA_DB:-/root/secretaria/state/maria-paez/db/maria.sqlite}"
H="2026-06-21"
echo "=== ahora (UTC) / pm2 ==="; date -u +%F\ %T
pm2 jlist 2>/dev/null | python3 -c "import sys,json,datetime as d;[print('maria-paez status=',p['pm2_env'].get('status'),'restarts=',p['pm2_env'].get('restart_time'),'up_desde=',d.datetime.fromtimestamp(p['pm2_env'].get('pm_uptime',0)/1000)) for p in json.load(sys.stdin) if p['name']=='maria-paez']" 2>&1
echo; echo "=== actividad de hoy ($H) por canal/direccion ==="
sqlite3 -cmd ".mode column" "$DB" "SELECT canal, direccion, count(*) n FROM eventos WHERE timestamp >= '$H' GROUP BY canal,direccion ORDER BY n DESC;" 2>&1
echo; echo "=== acciones ejecutadas vs falladas hoy ==="
sqlite3 -cmd ".mode list" "$DB" "SELECT CASE WHEN cuerpo LIKE 'acción ejecutada%' THEN 'OK' WHEN cuerpo LIKE 'acción FALLÓ%' THEN 'FALLO' END est, count(*) FROM eventos WHERE timestamp >= '$H' AND (cuerpo LIKE 'acción ejecutada%' OR cuerpo LIKE 'acción FALLÓ%') GROUP BY est;" 2>&1
echo; echo "=== fallos de hoy (detalle) ==="
sqlite3 -cmd ".mode list" "$DB" "SELECT substr(timestamp,1,16)||' | '||cuerpo FROM eventos WHERE timestamp >= '$H' AND cuerpo LIKE 'acción FALLÓ%' ORDER BY timestamp DESC LIMIT 10;" 2>&1
echo; echo "=== Google OAuth: ultimas señales de acceso_google / gmail / calendar hoy ==="
sqlite3 -cmd ".mode list" "$DB" "SELECT substr(timestamp,1,16)||' | '||substr(cuerpo,1,90) FROM eventos WHERE timestamp >= '$H' AND (cuerpo LIKE '%invalid_grant%' OR cuerpo LIKE '%acceso_google%' OR cuerpo LIKE '%oauth%' OR cuerpo LIKE '%token%') ORDER BY timestamp DESC LIMIT 6;" 2>&1
echo "  (vacío = sin errores de OAuth hoy)"
echo; echo "=== briefs enviados hoy ==="
sqlite3 "$DB" "SELECT count(*) FROM eventos WHERE timestamp >= '$H' AND cuerpo LIKE '%morning-brief%enviado%';" 2>&1
echo; echo "=== ultimo evento (liveness) ==="
sqlite3 "$DB" "SELECT max(timestamp) FROM eventos;" 2>&1
echo; echo "=== drift handling hoy: auto-ruteo / repair / desconocida en log pm2 ==="
pm2 logs maria-paez --lines 400 --nostream 2>/dev/null | grep -iE "auto-ruteo|repair|Acción desconocida|Tipo de acción descono" | tail -8
echo "  (vacío = ningun drift de accion hoy)"
