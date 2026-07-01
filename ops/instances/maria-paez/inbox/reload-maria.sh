#!/bin/bash
OUT_DIR="$(dirname "$0")/../outbox"; mkdir -p "$OUT_DIR"; OUT="$OUT_DIR/reload-maria.out"
{
echo "=== antes ==="
pm2 jlist 2>/dev/null | node -e 'let d="";process.stdin.on("data",x=>d+=x).on("end",()=>{JSON.parse(d).filter(p=>p.name=="maria-paez").forEach(p=>console.log("pid="+p.pid,"status="+p.pm2_env.status,"restarts="+p.pm2_env.restart_time,"uptime_s="+Math.round((Date.now()-p.pm2_env.pm_uptime)/1000)))})'
echo "=== reload via ecosystem (stderr visible) ==="
cd /root/secretaria && pm2 reload ecosystem.config.js --only maria-paez --update-env
echo "exit_reload=$?"
sleep 6
echo "=== despues ==="
pm2 jlist 2>/dev/null | node -e 'let d="";process.stdin.on("data",x=>d+=x).on("end",()=>{JSON.parse(d).filter(p=>p.name=="maria-paez").forEach(p=>console.log("pid="+p.pid,"status="+p.pm2_env.status,"restarts="+p.pm2_env.restart_time,"uptime_s="+Math.round((Date.now()-p.pm2_env.pm_uptime)/1000)))})'
echo "=== healthcheck env (DB + vault presentes en el proceso) ==="
pm2 env $(pm2 id maria-paez 2>/dev/null | tr -dc '0-9') 2>/dev/null | grep -E "^MARIA_DB=|^MARIA_VAULT_KEY=" | sed 's/\(VAULT_KEY=\).*/\1<set>/' 
echo "=== ultimas lineas log ==="
pm2 logs maria-paez --nostream --lines 12 2>/dev/null | tail -12
} > "$OUT" 2>&1
echo "done $(date)" >> "$OUT"
