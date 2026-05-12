#!/bin/bash
set +e
cd /root/secretaria

echo "════════════════════════════════════════════"
echo "1) Cuándo arrancó pm2 maria-paez (uptime)"
echo "════════════════════════════════════════════"
pm2 jlist 2>/dev/null | python3 -c "
import json, sys, time, datetime
ps = json.load(sys.stdin)
for p in ps:
    if p.get('name') != 'maria-paez': continue
    e = p.get('pm2_env', {})
    up = e.get('pm_uptime', 0)/1000
    started = datetime.datetime.fromtimestamp(up)
    age = (time.time() - up)/3600
    print(f'arrancó:     {started.isoformat()}')
    print(f'hace:        {age:.1f}h')
    print(f'restarts:    {e.get(\"restart_time\")}')
    print(f'unstable_restarts: {e.get(\"unstable_restarts\")}')
    print(f'exit_code:   {e.get(\"exit_code\")}')
    print(f'status:      {e.get(\"status\")}')
    print(f'created_at:  {datetime.datetime.fromtimestamp(e.get(\"created_at\",0)/1000).isoformat()}')
    print(f'axm_actions: {len(e.get(\"axm_actions\",[]))}')
"

echo
echo "════════════════════════════════════════════"
echo "2) Distribución temporal de SIGINT (24h)"
echo "════════════════════════════════════════════"
pm2 logs maria-paez --lines 10000 --nostream 2>/dev/null | grep -E "SIGINT recibido" | tail -30

echo
echo "════════════════════════════════════════════"
echo "3) ¿Quién manda SIGINT? Buscar contexto antes/después"
echo "════════════════════════════════════════════"
pm2 logs maria-paez --lines 10000 --nostream 2>/dev/null | grep -B2 -A4 "SIGINT recibido" | head -60

echo
echo "════════════════════════════════════════════"
echo "4) Restarts de pm2 — distribución temporal"
echo "════════════════════════════════════════════"
pm2 logs maria-paez --lines 10000 --nostream 2>/dev/null | grep -E "arrancando|inicializ|^.*pm-uptime|App \[maria-paez:0\] starting" | tail -30

echo
echo "── Marcadores de arranque en pm2 logs (boot signature) ──"
pm2 logs maria-paez --lines 10000 --nostream 2>/dev/null | grep -E "▸ arrancando loop de recordatorios" | tail -15

echo
echo "════════════════════════════════════════════"
echo "5) PROMPT VIOLATION 21:08 — qué pasó"
echo "════════════════════════════════════════════"
pm2 logs maria-paez --lines 10000 --nostream 2>/dev/null | grep -B3 -A8 "21:08" | head -80

echo
echo "════════════════════════════════════════════"
echo "6) Búsqueda directa: keywords prompt/jailbreak/violation alrededor de 21:08"
echo "════════════════════════════════════════════"
pm2 logs maria-paez --lines 10000 --nostream 2>/dev/null | grep -iE "prompt.*(violation|injection)|jailbreak" -B3 -A3 | head -40

echo
echo "════════════════════════════════════════════"
echo "7) ¿Hay loop o crash en restart_time vs uptime?"
echo "════════════════════════════════════════════"
# Si tenemos 13 restarts en ~12h, y cada restart tarda ~5s, ¿hay un patrón?
pm2 describe maria-paez 2>/dev/null | grep -E "restart|uptime|exit|pid|created" | head -15

echo "fin"
