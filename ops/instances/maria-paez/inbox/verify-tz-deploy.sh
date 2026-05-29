#!/bin/bash
# Verifica que el fix tz+loop quedó deployado y Maria arrancó limpio.
set -uo pipefail
cd /root/secretaria
echo "=== HEAD vivo en el VPS ==="
git log --oneline -1
echo ""
echo "=== codigo live tiene _tsLocal? ==="
grep -c "_tsLocal" memory.js context-fetcher.js
echo ""
echo "=== prompt tiene la regla del loop? ==="
grep -c "CERRÁ EL LOOP CON TERCEROS" prompt-builder.js
echo ""
echo "=== pm2 status ==="
pm2 jlist 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const a=JSON.parse(s);const m=a.find(x=>x.name==="maria-paez");if(!m){console.log("no maria-paez");return;}console.log("status:",m.pm2_env.status,"| restarts:",m.pm2_env.restart_time,"| uptime:",Math.round((Date.now()-m.pm2_env.pm_uptime)/1000)+"s");})'
echo ""
echo "=== ultimas lineas de boot (WA ready / errores) ==="
tail -40 /root/.pm2/logs/maria-paez-out.log 2>/dev/null | grep -iE "ready|iniciando|error|SIGINT|authenticated" | tail -12
