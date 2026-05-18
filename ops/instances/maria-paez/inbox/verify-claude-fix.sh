#!/bin/bash
set +e
echo "═══ pm2 reload ═══"
pm2 jlist 2>/dev/null | python3 -c 'import sys,json; d=[x for x in json.load(sys.stdin) if x["name"]=="maria-paez"]; r=d[0] if d else None; print("pid:", r["pid"], "restart:", r["pm2_env"]["restart_time"]) if r else print("no")'

echo ""
echo "═══ ¿código vivo tiene el fix? ═══"
grep -c "idleTimeoutMs\|_resetIdle\|killedByTimer" /root/secretaria/claude-client.js

echo ""
echo "═══ Defaults nuevos (timeouts) ═══"
grep -E "CLAUDE_TIMEOUT_MS|CLAUDE_IDLE_TIMEOUT_MS" /root/secretaria/claude-client.js | head -5

echo ""
echo "═══ Verificar errores recientes post-reload ═══"
pm2 logs maria-paez --lines 15 --nostream 2>&1 | grep -iE "error|fatal|SyntaxError" | tail -5

echo ""
echo "═══ Smoke test: provider carga sin error ═══"
cd /root/secretaria && node -e "
const c = require('./claude-client');
console.log('exports:', Object.keys(c).join(','));
" 2>&1
