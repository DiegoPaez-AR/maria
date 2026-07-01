#!/bin/bash
OUT_DIR="$(dirname "$0")/../outbox"; mkdir -p "$OUT_DIR"; OUT="$OUT_DIR/smoke-real-prompt.out"
DB="${MARIA_DB:?}"
{
cd /root/secretaria
export MARIA_MCP_ACTIONS=1
sqlite3 "$DB" "DELETE FROM hechos WHERE clave='_smoke_pref_cafe';"
echo "=== turno con PROMPT REAL (usuario owner), pidiendo guardar un hecho ==="
timeout 200 node -e '
const usuarios = require("./usuarios");
const { construirPrompt } = require("./prompt-builder");
const cc = require("./claude-client");
(async () => {
  const u = usuarios.obtener(1);
  const entrada = { de: u.wa_cus || u.wa_lid, nombre: u.nombre, cuerpo: "Guardá en tu memoria con la clave _smoke_pref_cafe que tomo café cortado sin azúcar.", messageId: "smoke-real", esUsuario: true, esMedia: false };
  try {
    const prompt = await construirPrompt({ usuario: u, canal: "whatsapp", entrada });
    const r = await cc.invocarClaudeJSON(prompt, { audit: { usuarioId: 1, canal: "whatsapp" } });
    const j = r && r.json ? r.json : r;
    console.log("RESP_USUARIO:", (j && (j.respuesta_a_usuario||j.respuesta)||"").toString().slice(0,200));
    console.log("ACCIONES_EN_ARRAY:", JSON.stringify((j && j.acciones)||[]).slice(0,300));
  } catch (e) { console.log("ERR:", e.message); }
})();
' 2>&1 | tail -20
echo
echo "=== hecho creado por el TOOL? (adopción con prompt real) ==="
sqlite3 -column -header "$DB" "SELECT id,clave,valor FROM hechos WHERE clave='_smoke_pref_cafe';"
echo "=== mcp_fallback generado por este turno? ==="
sqlite3 "$DB" "SELECT id, substr(cuerpo,1,100) FROM eventos WHERE json_extract(metadata_json,'\$.tipo')='mcp_fallback' AND timestamp >= datetime('now','-5 minutes');"
echo "(vacío = usó tool, no array)"
sqlite3 "$DB" "DELETE FROM hechos WHERE clave='_smoke_pref_cafe';"
} > "$OUT" 2>&1
echo done >> "$OUT"
