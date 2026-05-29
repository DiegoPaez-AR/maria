#!/bin/bash
set -uo pipefail
cd /root/secretaria
echo "=== HEAD vivo ==="; git log --oneline -1
echo "=== prompt tiene [TU IDENTIDAD]? ==="; grep -c "TU IDENTIDAD" prompt-builder.js
echo "=== default gmail fantasma sigue en el codigo? (debe ser 0) ==="; grep -c "maria.paez.secre@gmail.com" prompt-builder.js
echo "=== pm2 ==="
pm2 jlist 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const m=JSON.parse(s).find(x=>x.name==="maria-paez");console.log("status:",m.pm2_env.status,"restarts:",m.pm2_env.restart_time,"uptime:",Math.round((Date.now()-m.pm2_env.pm_uptime)/1000)+"s");})'
tail -25 /root/.pm2/logs/maria-paez-out.log 2>/dev/null | grep -iE "ready|iniciando|error|SIGINT" | tail -6
