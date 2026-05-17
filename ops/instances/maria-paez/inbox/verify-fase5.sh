#!/bin/bash
set +e
source /root/secretaria/config/instances/maria-paez.conf 2>/dev/null
TOKEN_PATH="${GOOGLE_TOKEN_PATH:-/root/secretaria/state/maria-paez/token.json}"

echo "═══ pm2 ═══"
pm2 jlist 2>/dev/null | python3 -c 'import sys,json; d=[x for x in json.load(sys.stdin) if x["name"]=="maria-paez"]; r=d[0] if d else None; print("pid:", r["pid"], "restart:", r["pm2_env"]["restart_time"]) if r else print("no")'

echo ""
echo "═══ Files del token ═══"
ls -la "$TOKEN_PATH" "${TOKEN_PATH}.enc" "${TOKEN_PATH}".bak.* 2>&1 | head -10

echo ""
echo "═══ pm2 logs últimas 80 — auto-migración / google ═══"
pm2 logs maria-paez --lines 100 --nostream 2>&1 | grep -iE "auto-migración|refresh_token|google\]|vault" | tail -25

echo ""
echo "═══ Healthcheck ═══"
bash /root/secretaria/ops/healthcheck.sh
