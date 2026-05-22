#!/bin/bash
# Mide latencia de claude_call (de la tabla eventos) — compara 1024 vs 512.
DB="${MARIA_DB:-/root/secretaria/state/maria-paez/db/maria.sqlite}"
echo "ahora UTC: $(date -u '+%Y-%m-%d %H:%M:%S')"
echo "valor actual .conf: $(grep -E '^MAX_THINKING_TOKENS=' /root/secretaria/config/instances/maria-paez.conf 2>/dev/null || echo '(no encontrado)')"
echo

medir() {
  local label="$1" cond="$2"
  sqlite3 "$DB" "SELECT CAST(substr(cuerpo, instr(cuerpo,': ')+2) AS INTEGER) AS ms FROM eventos WHERE cuerpo LIKE 'claude_call%' AND $cond ORDER BY ms;" \
  | node -e '
    const xs = require("fs").readFileSync(0,"utf8").trim().split("\n").map(Number).filter(n=>n>0);
    const L = process.argv[1];
    if(!xs.length){ console.log("  "+L+": sin datos"); process.exit(0); }
    xs.sort((a,b)=>a-b);
    const n=xs.length, sum=xs.reduce((a,b)=>a+b,0);
    const pct=p=>xs[Math.min(n-1, Math.floor(p/100*n))];
    const f=ms=>(ms/1000).toFixed(1)+"s";
    const over=t=>xs.filter(x=>x>=t).length;
    console.log("  n="+n+"   prom="+f(sum/n)+"   p50="+f(pct(50))+"   p90="+f(pct(90))+"   p95="+f(pct(95))+"   max="+f(pct(100))+"   min="+f(xs[0]));
    console.log("  >30s: "+over(30000)+" ("+(100*over(30000)/n).toFixed(0)+"%)   >60s: "+over(60000)+" ("+(100*over(60000)/n).toFixed(0)+"%)");
  ' "$label"
}

echo "=== MAX_THINKING_TOKENS = 1024  (2026-05-20 00:30 .. 2026-05-21 11:50 UTC) ==="
medir "1024" "timestamp >= '2026-05-20 00:30:00' AND timestamp < '2026-05-21 11:50:00'"
echo
echo "=== MAX_THINKING_TOKENS = 512  (desde 2026-05-21 12:00 UTC) ==="
medir "512" "timestamp >= '2026-05-21 12:00:00'"
echo
echo "(claude_call: latencia end-to-end de cada llamada al modelo, registrada en eventos)"
