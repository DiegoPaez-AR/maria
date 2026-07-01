#!/bin/bash
OUT_DIR="$(dirname "$0")/../outbox"; mkdir -p "$OUT_DIR"; OUT="$OUT_DIR/health-now.out"
DB="${MARIA_DB:?}"
{
echo "=== pm2 maria-paez ==="
pm2 jlist 2>/dev/null | node -e 'let d="";process.stdin.on("data",x=>d+=x).on("end",()=>{JSON.parse(d).filter(p=>p.name=="maria-paez").forEach(p=>console.log("pid="+p.pid,"status="+p.pm2_env.status,"restarts="+p.pm2_env.restart_time,"uptime_s="+Math.round((Date.now()-p.pm2_env.pm_uptime)/1000),"MARIA_MCP_ACTIONS="+p.pm2_env.MARIA_MCP_ACTIONS))})'
echo "=== WA ready + errores recientes ==="
pm2 logs maria-paez --nostream --lines 60 2>/dev/null | grep -iE "WA ready|authenticated|error|throw|SIGINT|crash" | tail -6
echo "=== turnos/acciones ultima hora (deberia ser flujo JSON normal, sin mcp_fallback nuevos) ==="
sqlite3 -column -header "$DB" "SELECT COUNT(*) claude_calls FROM eventos WHERE json_extract(metadata_json,'\$.tipo')='claude_call' AND timestamp>=datetime('now','-60 minutes');"
sqlite3 "$DB" "SELECT COUNT(*) FROM eventos WHERE json_extract(metadata_json,'\$.tipo')='mcp_fallback';" | sed 's/^/mcp_fallback total: /'
echo "=== ultimos WA reales (no smoke) ultimos 40min ==="
sqlite3 "$DB" "SELECT id, datetime(timestamp,'localtime'), direccion, substr(de,1,16), substr(replace(cuerpo,char(10),' '),1,70) FROM eventos WHERE canal='whatsapp' AND timestamp>=datetime('now','-40 minutes') ORDER BY id DESC LIMIT 8;"
} > "$OUT" 2>&1
echo done >> "$OUT"
