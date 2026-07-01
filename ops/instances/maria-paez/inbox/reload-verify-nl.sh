#!/bin/bash
OUT_DIR="$(dirname "$0")/../outbox"; mkdir -p "$OUT_DIR"; OUT="$OUT_DIR/reload-verify-nl.out"
{
echo "=== cambios desplegados? ==="
echo -n "regla bug-report: "; grep -c "REPORTAR FALLAS DEL SISTEMA AL OWNER" /root/secretaria/prompt-builder.js
echo -n "helper _normNL: "; grep -c "function _normNL" /root/secretaria/executor.js
echo -n "normalizaciones a.texto: "; grep -c "a.texto = _normNL(a.texto);" /root/secretaria/executor.js
echo "=== node --check ==="; node --check /root/secretaria/prompt-builder.js && node --check /root/secretaria/executor.js && echo "SYNTAX OK"
echo "=== _normNL sobre el pedido problemático (in-process) ==="
node -e "const m=require('/root/secretaria/executor.js');" 2>/dev/null; node -e "$(sed -n "$(grep -n 'function _normNL' /root/secretaria/executor.js|head -1|cut -d: -f1),+4p" /root/secretaria/executor.js); console.log(JSON.stringify(_normNL('Hola!\\\\n- 1 Tequeños\\\\n- 2 Tortitas')))"
echo "=== reload ==="
cd /root/secretaria && pm2 restart ecosystem.config.js --only maria-paez --update-env >/dev/null 2>&1; echo "restart=$?"
sleep 9
pm2 jlist 2>/dev/null | node -e 'let d="";process.stdin.on("data",x=>d+=x).on("end",()=>{JSON.parse(d).filter(p=>p.name=="maria-paez").forEach(p=>console.log("pid="+p.pid,"status="+p.pm2_env.status,"MARIA_MCP_ACTIONS="+p.pm2_env.MARIA_MCP_ACTIONS))})'
sleep 4; pm2 logs maria-paez --nostream --lines 25 2>/dev/null | grep -iE "WA ready|authenticated" | tail -2
} > "$OUT" 2>&1
echo done >> "$OUT"
