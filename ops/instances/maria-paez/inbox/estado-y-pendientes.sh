#!/bin/bash
OUT_DIR="$(dirname "$0")/../outbox"; mkdir -p "$OUT_DIR"; OUT="$OUT_DIR/estado-y-pendientes.out"
DB="${MARIA_DB:?}"
{
echo "########## ESTADO TRIAL MCP ##########"
pm2 jlist 2>/dev/null | node -e 'let d="";process.stdin.on("data",x=>d+=x).on("end",()=>{JSON.parse(d).filter(p=>p.name=="maria-paez").forEach(p=>console.log("MCP="+p.pm2_env.MARIA_MCP_ACTIONS,"status="+p.pm2_env.status,"uptime_min="+Math.round((Date.now()-p.pm2_env.pm_uptime)/60000)))})'
echo "-- turnos WA reales desde el re-flip (14:09):"
sqlite3 -column -header "$DB" "SELECT COUNT(*) claude_calls_wa FROM eventos WHERE json_extract(metadata_json,'\$.tipo')='claude_call' AND json_extract(metadata_json,'\$.canal')='whatsapp' AND timestamp>=datetime('2026-07-01 14:09:00');"
echo "-- acciones ejecutadas vs falladas desde 14:09:"
sqlite3 -column -header "$DB" "SELECT CASE WHEN cuerpo LIKE 'acción ejecutada%' THEN 'OK' ELSE 'FALLO' END res, COUNT(*) FROM eventos WHERE (cuerpo LIKE 'acción ejecutada%' OR cuerpo LIKE 'acción FALLÓ%') AND timestamp>=datetime('2026-07-01 14:09:00') GROUP BY res;"
echo "-- mcp_fallback desde 14:09:"
sqlite3 "$DB" "SELECT COUNT(*) FROM eventos WHERE json_extract(metadata_json,'\$.tipo')='mcp_fallback' AND timestamp>=datetime('2026-07-01 14:09:00');"
echo "-- ultimos WA reales (para ver un turno):"
sqlite3 "$DB" "SELECT id,datetime(timestamp,'localtime'),direccion,substr(de,1,15),substr(replace(cuerpo,char(10),' '),1,60) FROM eventos WHERE canal='whatsapp' AND timestamp>=datetime('2026-07-01 14:09:00') ORDER BY id DESC LIMIT 6;"
echo
echo "########## PENDIENTES BAJO TU USUARIO (uid=1) ##########"
sqlite3 -column -header "$DB" "SELECT id, substr(json_extract(meta_json,'\$.dueno'),1,7) dueno, substr(json_extract(meta_json,'\$.disparador'),1,16) disp, substr(desc,1,90) desc, substr(coalesce(remitente,destino_wa,''),1,18) quien FROM pendientes WHERE usuario_id=1 AND estado='abierto' ORDER BY id;"
echo
echo "########## PENDIENTES DE GABI (uid=18) actuales ##########"
sqlite3 -column -header "$DB" "SELECT id, substr(desc,1,70) desc FROM pendientes WHERE usuario_id=18 AND estado='abierto' ORDER BY id;"
} > "$OUT" 2>&1
echo done >> "$OUT"
