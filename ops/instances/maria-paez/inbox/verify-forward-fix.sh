#!/bin/bash
set +e
echo "═══ pm2 ═══"
pm2 jlist 2>/dev/null | python3 -c 'import sys,json; d=[x for x in json.load(sys.stdin) if x["name"]=="maria-paez"]; r=d[0] if d else None; print("pid:", r["pid"], "restart:", r["pm2_env"]["restart_time"]) if r else print("no")'

echo ""
echo "═══ ¿código vivo tiene fix? ═══"
grep -c "mediaInfo" /root/secretaria/whatsapp-handler.js /root/secretaria/unknown-flow.js
grep -c "mediaMessageId" /root/secretaria/memory.js

echo ""
echo "═══ Smoke: sintaxis ═══"
cd /root/secretaria && node -e "require('./whatsapp-handler'); require('./unknown-flow'); require('./memory'); console.log('OK 3 archivos cargan');"

echo ""
echo "═══ pm2 logs últimas 20 (errores post-reload?) ═══"
pm2 logs maria-paez --lines 25 --nostream 2>&1 | tail -20
