#!/bin/bash
OUT_DIR="$(dirname "$0")/../outbox"; mkdir -p "$OUT_DIR"; OUT="$OUT_DIR/reload-verify-dedupe.out"
{
echo "=== dedupe presente en handler desplegado? ==="
grep -c "WA dedupe" /root/secretaria/whatsapp-handler.js
echo "=== node --check ==="; node --check /root/secretaria/whatsapp-handler.js && echo "SYNTAX OK"
echo "=== reload via ecosystem ==="
cd /root/secretaria && pm2 reload ecosystem.config.js --only maria-paez --update-env; echo "exit=$?"
sleep 6
pm2 jlist 2>/dev/null | node -e 'let d="";process.stdin.on("data",x=>d+=x).on("end",()=>{JSON.parse(d).filter(p=>p.name=="maria-paez").forEach(p=>console.log("pid="+p.pid,"status="+p.pm2_env.status,"restarts="+p.pm2_env.restart_time,"uptime_s="+Math.round((Date.now()-p.pm2_env.pm_uptime)/1000)))})'
echo "=== arranque limpio? ==="; pm2 logs maria-paez --nostream --lines 6 2>/dev/null | tail -6
} > "$OUT" 2>&1
echo "done $(date)" >> "$OUT"
