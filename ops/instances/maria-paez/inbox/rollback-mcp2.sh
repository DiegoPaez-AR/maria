#!/bin/bash
OUT_DIR="$(dirname "$0")/../outbox"; mkdir -p "$OUT_DIR"; OUT="$OUT_DIR/rollback-mcp2.out"
CONF=/root/secretaria/config/instances/maria-paez.conf
{
# asegurar MARIA_MCP_ACTIONS=0 explícito (no basta con borrar la línea: pm2 no unsetea)
sed -i '/^MARIA_MCP_ACTIONS=/d' "$CONF"
printf '\n# Fase 2 MCP: APAGADO (rollback 2026-07-01, adopción con prompt real insuficiente)\nMARIA_MCP_ACTIONS=0\n' >> "$CONF"
echo "=== .conf ==="; grep -n 'MARIA_MCP_ACTIONS' "$CONF"
echo "=== restart (NO reload) para limpiar env del proceso ==="
cd /root/secretaria && pm2 restart ecosystem.config.js --only maria-paez --update-env; echo "restart=$?"
sleep 10
pm2 jlist 2>/dev/null | node -e 'let d="";process.stdin.on("data",x=>d+=x).on("end",()=>{JSON.parse(d).filter(p=>p.name=="maria-paez").forEach(p=>console.log("pid="+p.pid,"status="+p.pm2_env.status,"MARIA_MCP_ACTIONS="+(p.pm2_env.MARIA_MCP_ACTIONS)))})'
sleep 4; pm2 logs maria-paez --nostream --lines 25 2>/dev/null | grep -iE "WA ready|authenticated" | tail -2
} > "$OUT" 2>&1
echo done >> "$OUT"
