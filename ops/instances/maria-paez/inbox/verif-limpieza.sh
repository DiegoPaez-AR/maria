#!/bin/bash
OUT_DIR="$(dirname "$0")/../outbox"; mkdir -p "$OUT_DIR"; OUT="$OUT_DIR/verif-limpieza.out"
DB="${MARIA_DB:?}"
{
echo "=== artefactos de prueba que hayan quedado (deberia ser vacio) ==="
echo "-- hechos smoke/test:"; sqlite3 "$DB" "SELECT id,clave FROM hechos WHERE clave LIKE '%smoke%' OR clave LIKE '%probe%' OR valor LIKE '%probando adopcion%';"
echo "-- eventos ZZ_TEST:"; sqlite3 "$DB" "SELECT id,substr(cuerpo,1,50) FROM eventos WHERE cuerpo LIKE '%ZZ_TEST%' AND canal='calendar' AND timestamp>=datetime('now','-1 day');"
echo "-- contactos de prueba:"; sqlite3 "$DB" "SELECT id,nombre FROM contactos WHERE nombre LIKE '%smoke%' OR nombre LIKE '%ZZ_%';"
echo "=== MCP desde el re-flip (14:09): estado + fallbacks + errores ==="
pm2 jlist 2>/dev/null | node -e 'let d="";process.stdin.on("data",x=>d+=x).on("end",()=>{JSON.parse(d).filter(p=>p.name=="maria-paez").forEach(p=>console.log("MCP="+p.pm2_env.MARIA_MCP_ACTIONS,"status="+p.pm2_env.status,"uptime_s="+Math.round((Date.now()-p.pm2_env.pm_uptime)/1000)))})'
echo "-- mcp_fallback desde 14:09:"; sqlite3 "$DB" "SELECT COUNT(*) FROM eventos WHERE json_extract(metadata_json,'\$.tipo')='mcp_fallback' AND timestamp>=datetime('now','-40 minutes');"
echo "-- claude_call errores/timeout desde 14:09:"; sqlite3 "$DB" "SELECT COUNT(*) FROM eventos WHERE cuerpo LIKE 'Claude falló%' AND timestamp>=datetime('now','-40 minutes');"
echo "-- inbox pendiente (deberia solo .gitkeep tras correr esto):"; ls /root/secretaria/ops/instances/maria-paez/inbox/
} > "$OUT" 2>&1
echo done >> "$OUT"
