#!/bin/bash
OUT_DIR="$(dirname "$0")/../outbox"; mkdir -p "$OUT_DIR"; OUT="$OUT_DIR/smoke-fewshot2.out"
DB="${MARIA_DB:?}"
{
cd /root/secretaria
export MARIA_MCP_ACTIONS=1
echo "=== hechos café existentes (¿el tool los creó en tests previos?) ==="
sqlite3 -column -header "$DB" "SELECT id,usuario_id,clave,substr(valor,1,30),datetime(creado,'localtime') FROM hechos WHERE usuario_id=1 AND (clave LIKE '%cafe%' OR valor LIKE '%cortado%') ORDER BY id DESC LIMIT 5;"
echo
K="_smoke_$(date +%s)"
echo "clave nueva: $K"
sqlite3 "$DB" "DELETE FROM hechos WHERE clave='$K';"
echo "=== smoke con hecho NUEVO + clave explícita ==="
timeout 200 node -e '
const usuarios=require("./usuarios"); const {construirPrompt}=require("./prompt-builder"); const cc=require("./claude-client");
(async()=>{ const u=usuarios.obtener(1);
 const entrada={de:u.wa_cus||u.wa_lid,nombre:u.nombre,cuerpo:"Guardá un dato en tu memoria: usá EXACTAMENTE la clave \"'"$K"'\" con el valor \"probando adopcion de tools\".",messageId:"fs2",esUsuario:true,esMedia:false};
 try{ const p=await construirPrompt({usuario:u,canal:"whatsapp",entrada}); const r=await cc.invocarClaudeJSON(p,{audit:{usuarioId:1,canal:"whatsapp"}}); const j=r&&r.json?r.json:r; console.log("RESP:",(j&&(j.respuesta_a_usuario||j.respuesta)||"").toString().slice(0,120)); }catch(e){console.log("ERR:",e.message);} })();' 2>&1 | tail -6
echo "=== hecho $K creado? (aparece = ADOPCIÓN OK) ==="
sqlite3 -column -header "$DB" "SELECT clave,valor FROM hechos WHERE clave='$K';"
sqlite3 "$DB" "DELETE FROM hechos WHERE clave='$K';"
} > "$OUT" 2>&1
echo done >> "$OUT"
