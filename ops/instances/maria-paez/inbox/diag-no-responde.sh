#!/bin/bash
set +e
DB="/root/secretaria/state/maria-paez/db/maria.sqlite"

echo "═══ pm2 status actual ═══"
pm2 jlist 2>/dev/null | python3 -c '
import sys, json, datetime
d=[x for x in json.load(sys.stdin) if x["name"]=="maria-paez"]
r=d[0] if d else None
if r:
    print("pid:", r["pid"], "status:", r["pm2_env"]["status"], "restarts:", r["pm2_env"]["restart_time"])
    print("arrancó:", datetime.datetime.fromtimestamp(r["pm2_env"]["pm_uptime"]/1000).isoformat())
'

echo ""
echo "═══ Eventos entrantes últimos 5 min ═══"
sqlite3 -header -column "$DB" "SELECT datetime(timestamp), canal, direccion, substr(de,1,30), substr(cuerpo,1,80) FROM eventos WHERE timestamp >= datetime('now','-5 minutes') ORDER BY timestamp ASC LIMIT 15;"

echo ""
echo "═══ pm2 logs últimas 60 (todo, sin filtro) ═══"
pm2 logs maria-paez --lines 60 --nostream 2>&1 | tail -55

echo ""
echo "═══ ¿WA conectado? estado boot ═══"
pm2 logs maria-paez --lines 200 --nostream 2>&1 | grep -iE "WA ready|WA authenticated|WA disconnected|QR|loading" | tail -10
