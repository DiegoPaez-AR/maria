#!/bin/bash
set +e
DB="/root/secretaria/state/maria-paez/db/maria.sqlite"

echo "═══ pm2 status + uptime ═══"
pm2 jlist 2>/dev/null | python3 -c '
import sys, json, datetime
d=[x for x in json.load(sys.stdin) if x["name"]=="maria-paez"]
r=d[0] if d else None
if r:
    ms = r["pm2_env"]["pm_uptime"]
    arr = datetime.datetime.fromtimestamp(ms/1000)
    age = (datetime.datetime.now() - arr).total_seconds()
    print("pid:", r["pid"], "status:", r["pm2_env"]["status"], "restarts:", r["pm2_env"]["restart_time"])
    print("arrancó:", arr.isoformat(), f"(hace {int(age)}s)")
'

echo ""
echo "═══ Eventos WA últimos 10 minutos ═══"
sqlite3 -header -column "$DB" "SELECT datetime(timestamp), direccion, substr(de,1,30), substr(cuerpo,1,80) FROM eventos WHERE canal='whatsapp' AND timestamp >= datetime('now','-10 minutes') ORDER BY timestamp ASC;"

echo ""
echo "═══ pm2 logs últimas 80 (TODO sin filtro) ═══"
pm2 logs maria-paez --lines 80 --nostream 2>&1 | tail -80
