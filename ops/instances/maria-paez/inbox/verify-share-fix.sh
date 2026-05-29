#!/bin/bash
set -uo pipefail
cd /root/secretaria
echo "=== HEAD vivo ==="; git log --oneline -1
echo "=== executor self-heal presente? ==="; grep -c "Self-heal" executor.js
echo "=== gmail-handler ES presente? ==="; grep -c "calendario compartido" gmail-handler.js
echo "=== prompt regla fallo persistente? ==="; grep -c "SIGUE en \"none\"" prompt-builder.js
echo "=== Hernan calendar_acceso ahora ==="
cf=config/instances/maria-paez.conf; set -a; . "$cf"; set +a
sqlite3 -header -column "$MARIA_DB" "SELECT id,nombre,calendar_acceso FROM usuarios WHERE id=2;"
echo "=== pm2 ==="
pm2 jlist 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const m=JSON.parse(s).find(x=>x.name==="maria-paez");console.log("status:",m.pm2_env.status,"restarts:",m.pm2_env.restart_time,"uptime:",Math.round((Date.now()-m.pm2_env.pm_uptime)/1000)+"s");})'
