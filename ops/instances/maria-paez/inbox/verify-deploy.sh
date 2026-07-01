#!/bin/bash
OUT_DIR="$(dirname "$0")/../outbox"; mkdir -p "$OUT_DIR"; OUT="$OUT_DIR/verify-deploy.out"
{
echo "=== VPS repo HEAD ==="; git -C /root/secretaria rev-parse --short HEAD 2>&1
echo "=== regla nueva presente en prompt-builder desplegado? ==="
grep -c "VOS SOS LA SECRETARIA DE" /root/secretaria/prompt-builder.js 2>&1
grep -c "DEFAULTS NO PISAN DATOS EXPLÍCITOS" /root/secretaria/prompt-builder.js 2>&1
grep -c "TE MARCA UN ERROR" /root/secretaria/prompt-builder.js 2>&1
echo "=== node --check ==="; node --check /root/secretaria/prompt-builder.js 2>&1 && echo "SYNTAX OK"
echo "=== pm2 maria-paez status/uptime/restarts ==="
pm2 jlist 2>/dev/null | node -e 'let d="";process.stdin.on("data",x=>d+=x).on("end",()=>{try{JSON.parse(d).filter(p=>p.name=="maria-paez").forEach(p=>console.log(p.name,"status="+p.pm2_env.status,"restarts="+p.pm2_env.restart_time,"uptime_ms="+(Date.now()-p.pm2_env.pm_uptime)))}catch(e){console.log("jlist parse err",e.message)}})'
echo "=== ultimos errores pm2 log ==="; pm2 logs maria-paez --nostream --lines 8 --err 2>/dev/null | tail -8
} > "$OUT" 2>&1
echo "done $(date)" >> "$OUT"
