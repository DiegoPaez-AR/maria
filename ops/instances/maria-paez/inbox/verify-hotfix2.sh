#!/bin/bash
set +e
echo "═══ pm2 ═══"
pm2 jlist 2>/dev/null | python3 -c 'import sys,json; d=[x for x in json.load(sys.stdin) if x["name"]=="maria-paez"]; r=d[0] if d else None; print("pid:", r["pid"], "restart:", r["pm2_env"]["restart_time"]) if r else print("no")'
echo ""
echo "═══ ¿_lastIncoming declarado en código vivo? ═══"
grep -c "^const _lastIncoming" /root/secretaria/whatsapp-handler.js
grep -c "_lastIncoming\.set" /root/secretaria/whatsapp-handler.js
grep -c "_lastIncoming\.get" /root/secretaria/whatsapp-handler.js
echo ""
echo "═══ errores recientes ═══"
pm2 logs maria-paez --lines 80 --nostream 2>&1 | grep -iE "ReferenceError|unhandledRejection|fatal|SyntaxError" | tail -10
echo ""
echo "═══ últimos eventos WA ═══"
sqlite3 -header -column /root/secretaria/state/maria-paez/db/maria.sqlite "SELECT datetime(timestamp), direccion, substr(cuerpo,1,60) FROM eventos WHERE canal='whatsapp' AND timestamp >= datetime('now','-15 minutes') ORDER BY timestamp ASC LIMIT 15;"
