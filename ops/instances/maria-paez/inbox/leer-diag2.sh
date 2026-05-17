#!/bin/bash
set +e
echo "═══ pm2 ═══"
pm2 jlist 2>/dev/null | python3 -c 'import sys,json; d=[x for x in json.load(sys.stdin) if x["name"]=="maria-paez"]; r=d[0] if d else None; print("pid:", r["pid"], "restart:", r["pm2_env"]["restart_time"]) if r else print("no")'

echo ""
echo "═══ ¿código vivo tiene DIAG2? ═══"
grep -c "DIAG2 vcard" /root/secretaria/whatsapp-handler.js

echo ""
echo "═══ pm2 logs últimas 800 — DIAG2 + vcard + 5491132317896 ═══"
pm2 logs maria-paez --lines 800 --nostream 2>&1 | grep -iE "DIAG2|📒 \[WA vcard|acerbo|acero|acevedo|5491132317896.*vcard" | tail -50

echo ""
echo "═══ pm2 logs — cualquier error reciente ═══"
pm2 logs maria-paez --lines 200 --nostream --err 2>&1 | tail -30
