#!/bin/bash
set +e
DB="${MARIA_DB:-/root/secretaria/state/maria-paez/db/maria.sqlite}"
WA="5491161549534@c.us"
echo "=== ahora (UTC) ==="; date -u +%F\ %T
echo; echo "=== pm2 maria-paez restarts/uptime ==="
pm2 jlist 2>/dev/null | python3 -c "import sys,json,datetime;[print(p['name'],'restarts=',p['pm2_env'].get('restart_time'),'up=',datetime.datetime.fromtimestamp(p['pm2_env'].get('pm_uptime',0)/1000)) for p in json.load(sys.stdin) if p['name']=='maria-paez']" 2>&1
echo; echo "=== acciones WA-envio hoy (ok/fallidas/desconocida) ==="
sqlite3 -cmd ".mode list" "$DB" "SELECT substr(timestamp,1,16)||' | '||cuerpo FROM eventos WHERE timestamp >= '2026-06-20' AND (cuerpo LIKE '%enviar_wa%' OR cuerpo LIKE '%wa_enviar%' OR cuerpo LIKE '%enviar_whatsapp%' OR cuerpo LIKE '%mandar_wa%' OR cuerpo LIKE '%descono%') ORDER BY timestamp DESC LIMIT 12;" 2>&1
echo; echo "=== eventos hacia/sobre Alfonso hoy ==="
sqlite3 -cmd ".mode list" "$DB" "SELECT substr(timestamp,1,16)||' | '||canal||'/'||direccion||' | '||substr(cuerpo,1,120) FROM eventos WHERE (cuerpo LIKE '%5491161549534%' OR cuerpo LIKE '%Alfonso%') AND timestamp >= '2026-06-20' ORDER BY timestamp DESC LIMIT 15;" 2>&1
echo; echo "=== log pm2 reciente (envio/WA/accion) ==="
pm2 logs maria-paez --lines 250 --nostream 2>/dev/null | grep -iE "enviar_wa|→3ro|acciones/|Alfonso|enviarWADirecto|No pude mandar|descono|getNumberId|No LID" | tail -25
