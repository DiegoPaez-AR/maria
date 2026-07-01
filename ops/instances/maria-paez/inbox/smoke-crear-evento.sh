#!/bin/bash
OUT_DIR="$(dirname "$0")/../outbox"; mkdir -p "$OUT_DIR"; OUT="$OUT_DIR/smoke-crear-evento.out"
DB="${MARIA_DB:?}"
{
cd /root/secretaria
export MARIA_MCP_ACTIONS=1
echo "=== limpiar hecho café de prueba (id 40 y variantes) ==="
sqlite3 "$DB" "DELETE FROM hechos WHERE usuario_id=1 AND (clave LIKE '%smoke%' OR (clave='cafe' AND valor LIKE '%cortado%'));"
echo "=== smoke crear_evento (acción de runtime, toca calendar/Google) ==="
timeout 220 node -e '
const usuarios=require("./usuarios"); const {construirPrompt}=require("./prompt-builder"); const cc=require("./claude-client");
(async()=>{ const u=usuarios.obtener(1);
 const entrada={de:u.wa_cus||u.wa_lid,nombre:u.nombre,cuerpo:"Agendame un evento de prueba llamado ZZ_TEST_MCP el 30 de diciembre de 2026 de 23:00 a 23:30.",messageId:"ev",esUsuario:true,esMedia:false};
 try{ const p=await construirPrompt({usuario:u,canal:"whatsapp",entrada}); const r=await cc.invocarClaudeJSON(p,{audit:{usuarioId:1,canal:"whatsapp"}}); const j=r&&r.json?r.json:r; console.log("RESP:",(j&&(j.respuesta_a_usuario||j.respuesta)||"").toString().slice(0,140)); console.log("ACCIONES_ARRAY:",JSON.stringify((j&&j.acciones)||[]).slice(0,120)); }catch(e){console.log("ERR:",e.message);} })();' 2>&1 | tail -8
echo "=== evento creado? (log calendar del executor, ultimos 5 min) ==="
sqlite3 -column "$DB" "SELECT id,datetime(timestamp,'localtime'),substr(cuerpo,1,80) FROM eventos WHERE canal='calendar' AND cuerpo LIKE '%ZZ_TEST_MCP%' AND timestamp>=datetime('now','-5 minutes');"
echo "=== mcp_fallback en estos 5 min? (vacío = usó tool) ==="
sqlite3 "$DB" "SELECT id,substr(cuerpo,1,80) FROM eventos WHERE json_extract(metadata_json,'\$.tipo')='mcp_fallback' AND timestamp>=datetime('now','-5 minutes');"
} > "$OUT" 2>&1
echo done >> "$OUT"
