#!/bin/bash
set +e
echo "═══ pm2 reload ═══"
pm2 jlist 2>/dev/null | python3 -c 'import sys,json; d=[x for x in json.load(sys.stdin) if x["name"]=="maria-paez"]; r=d[0] if d else None; print("pid:", r["pid"], "restart:", r["pm2_env"]["restart_time"]) if r else print("no")'

echo ""
echo "═══ ¿código tiene _lastIncoming + _hayMsgNuevoDesdeStart? ═══"
grep -c "_lastIncoming\|_hayMsgNuevoDesdeStart\|ABORTADO.*procesamiento" /root/secretaria/whatsapp-handler.js

echo ""
echo "═══ Errores post-reload ═══"
pm2 logs maria-paez --lines 15 --nostream 2>&1 | grep -iE "error|fatal|SyntaxError" | tail -5

echo ""
echo "═══ Smoke syntax ═══"
node -c /root/secretaria/whatsapp-handler.js 2>&1 && echo "OK"
