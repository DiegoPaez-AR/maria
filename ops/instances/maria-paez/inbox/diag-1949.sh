#!/bin/bash
set +e
echo "═══ pm2 logs últimas 600 desde 19:48 ═══"
pm2 logs maria-paez --lines 600 --nostream 2>&1 | grep -E "19:4[89]|19:5[0-9]|DIAG2|vcard" | tail -50

echo ""
echo "═══ Eventos entrantes WA últimos 5 min ═══"
DB="/root/secretaria/state/maria-paez/db/maria.sqlite"
sqlite3 -header -column "$DB" "SELECT datetime(timestamp), direccion, tipo_original, substr(de,1,30) AS de, LENGTH(cuerpo) AS body_len FROM eventos WHERE canal='whatsapp' AND timestamp >= datetime('now','-5 minutes') ORDER BY timestamp ASC LIMIT 20;"

echo ""
echo "═══ pm2 status + restart time ═══"
pm2 jlist 2>/dev/null | python3 -c '
import sys,json,datetime
d=[x for x in json.load(sys.stdin) if x["name"]=="maria-paez"]
r=d[0] if d else None
if r:
    print("pid:", r["pid"], "status:", r["pm2_env"]["status"], "restarts:", r["pm2_env"]["restart_time"])
    print("arrancó:", datetime.datetime.fromtimestamp(r["pm2_env"]["pm_uptime"]/1000).isoformat())
'

echo ""
echo "═══ últimas 30 lineas pm2 logs RAW ═══"
pm2 logs maria-paez --lines 30 --nostream 2>&1 | tail -25
