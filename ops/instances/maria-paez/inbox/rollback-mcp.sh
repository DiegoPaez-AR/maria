#!/bin/bash
OUT_DIR="$(dirname "$0")/../outbox"; mkdir -p "$OUT_DIR"; OUT="$OUT_DIR/rollback-mcp.out"
CONF=/root/secretaria/config/instances/maria-paez.conf
{
echo "=== antes ==="; grep -n 'MARIA_MCP_ACTIONS' "$CONF" || echo "(no está)"
# borrar la línea del flag + su comentario de trial
sed -i '/^MARIA_MCP_ACTIONS=1$/d; /# Fase 2: acciones como tools MCP — trial/d' "$CONF"
echo "=== después (debe quedar sin MARIA_MCP_ACTIONS) ==="; grep -n 'MARIA_MCP_ACTIONS' "$CONF" || echo "(removido OK)"
echo "=== reload ==="
cd /root/secretaria && pm2 reload ecosystem.config.js --only maria-paez --update-env; echo "reload=$?"
sleep 9
pm2 jlist 2>/dev/null | node -e 'let d="";process.stdin.on("data",x=>d+=x).on("end",()=>{JSON.parse(d).filter(p=>p.name=="maria-paez").forEach(p=>console.log("pid="+p.pid,"status="+p.pm2_env.status,"MARIA_MCP_ACTIONS="+(p.pm2_env.MARIA_MCP_ACTIONS||"(off)")))})'
sleep 3; pm2 logs maria-paez --nostream --lines 25 2>/dev/null | grep -iE "WA ready|authenticated" | tail -2
} > "$OUT" 2>&1
echo done >> "$OUT"
