#!/bin/bash
OUT_DIR="$(dirname "$0")/../outbox"; mkdir -p "$OUT_DIR"; OUT="$OUT_DIR/flip-mcp-on.out"
CONF=/root/secretaria/config/instances/maria-paez.conf
{
echo "=== .conf antes (MARIA_MCP_ACTIONS?) ==="
grep -n 'MARIA_MCP_ACTIONS' "$CONF" || echo "(no está)"
if ! grep -q '^MARIA_MCP_ACTIONS=' "$CONF"; then
  printf '\n# Fase 2: acciones como tools MCP — trial 2026-07-01 (rollback: borrar esta línea + reload)\nMARIA_MCP_ACTIONS=1\n' >> "$CONF"
  echo "APPENDED"
fi
echo "=== .conf después ==="
grep -n 'MARIA_MCP_ACTIONS' "$CONF"
echo "=== reload ecosystem (inyecta el nuevo env) ==="
cd /root/secretaria && pm2 reload ecosystem.config.js --only maria-paez --update-env; echo "reload=$?"
sleep 9
echo "=== proceso: pid/uptime + MARIA_MCP_ACTIONS en el env vivo ==="
pm2 jlist 2>/dev/null | node -e 'let d="";process.stdin.on("data",x=>d+=x).on("end",()=>{JSON.parse(d).filter(p=>p.name=="maria-paez").forEach(p=>console.log("pid="+p.pid,"status="+p.pm2_env.status,"restarts="+p.pm2_env.restart_time,"uptime_s="+Math.round((Date.now()-p.pm2_env.pm_uptime)/1000),"MARIA_MCP_ACTIONS="+p.pm2_env.MARIA_MCP_ACTIONS))})'
echo "=== WA ready ==="
sleep 4; pm2 logs maria-paez --nostream --lines 30 2>/dev/null | grep -iE "WA ready|authenticated|internal-api escuchando" | tail -4
} > "$OUT" 2>&1
echo done >> "$OUT"
