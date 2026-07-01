#!/bin/bash
OUT_DIR="$(dirname "$0")/../outbox"; mkdir -p "$OUT_DIR"; OUT="$OUT_DIR/reflip-mcp-on.out"
CONF=/root/secretaria/config/instances/maria-paez.conf
{
sed -i '/^MARIA_MCP_ACTIONS=/d; /# Fase 2 MCP: APAGADO/d' "$CONF"
printf '\n# Fase 2 MCP: ON (trial 2026-07-01, adopción validada con few-shot; rollback: poner =0 + pm2 restart)\nMARIA_MCP_ACTIONS=1\n' >> "$CONF"
echo "=== .conf ==="; grep -n 'MARIA_MCP_ACTIONS' "$CONF"
echo "=== restart (toma env nuevo) ==="
cd /root/secretaria && pm2 restart ecosystem.config.js --only maria-paez --update-env >/dev/null 2>&1; echo "restart=$?"
sleep 10
pm2 jlist 2>/dev/null | node -e 'let d="";process.stdin.on("data",x=>d+=x).on("end",()=>{JSON.parse(d).filter(p=>p.name=="maria-paez").forEach(p=>console.log("pid="+p.pid,"status="+p.pm2_env.status,"MARIA_MCP_ACTIONS="+p.pm2_env.MARIA_MCP_ACTIONS))})'
sleep 4; pm2 logs maria-paez --nostream --lines 30 2>/dev/null | grep -iE "WA ready|authenticated" | tail -2
} > "$OUT" 2>&1
echo done >> "$OUT"
