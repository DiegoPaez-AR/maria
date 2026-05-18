#!/bin/bash
set +e
DB="/root/secretaria/state/maria-paez/db/maria.sqlite"

echo "═══ Últimos 15 eventos WA (entrante/saliente) últimas 2h ═══"
sqlite3 -header -column "$DB" "
SELECT datetime(timestamp), direccion, substr(de,1,28) AS de, substr(cuerpo,1,100) AS msg
FROM eventos WHERE canal='whatsapp' AND timestamp >= datetime('now','-2 hours')
ORDER BY timestamp DESC LIMIT 15;
"

echo ""
echo "═══ Últimas 50 lineas pm2 logs SIN FILTRO ═══"
pm2 logs maria-paez --lines 50 --nostream 2>&1 | tail -45

echo ""
echo "═══ errores recientes (ultimo hora) ═══"
pm2 logs maria-paez --lines 200 --nostream 2>&1 | grep -E "^0\|maria-pa | 2026-05-18 (1[0-2]|0[7-9])" | grep -iE "error|fatal|abort|unhandled" | tail -15

echo ""
echo "═══ pm2 status ═══"
pm2 jlist 2>/dev/null | python3 -c '
import sys,json,datetime
d=[x for x in json.load(sys.stdin) if x["name"]=="maria-paez"]
r=d[0] if d else None
if r:
    arr=datetime.datetime.fromtimestamp(r["pm2_env"]["pm_uptime"]/1000)
    age=(datetime.datetime.now() - arr).total_seconds()
    print("pid:",r["pid"],"restart:",r["pm2_env"]["restart_time"],"arrancó:",arr.isoformat(),"hace",int(age),"s")
'
