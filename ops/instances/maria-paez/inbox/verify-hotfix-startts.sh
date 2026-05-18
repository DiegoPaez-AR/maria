#!/bin/bash
set +e
echo "═══ pm2 ═══"
pm2 jlist 2>/dev/null | python3 -c 'import sys,json; d=[x for x in json.load(sys.stdin) if x["name"]=="maria-paez"]; r=d[0] if d else None; print("pid:", r["pid"], "restart:", r["pm2_env"]["restart_time"]) if r else print("no")'
echo ""
echo "═══ ¿código tiene fix? ═══"
grep -c "const startTs = _lastIncoming" /root/secretaria/whatsapp-handler.js
grep -c "function _despacharGrupo.*startTs" /root/secretaria/whatsapp-handler.js
echo ""
echo "═══ errores recientes (últimas 100 lineas) ═══"
pm2 logs maria-paez --lines 100 --nostream 2>&1 | grep -iE "ReferenceError|SyntaxError|fatal|error despachando" | tail -10
echo ""
echo "═══ healthcheck ═══"
bash /root/secretaria/ops/healthcheck.sh | python3 -c 'import sys,json; d=json.load(sys.stdin); print("overall_ok:",d["overall_ok"])'
