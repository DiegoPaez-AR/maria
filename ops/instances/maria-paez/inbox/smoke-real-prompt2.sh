#!/bin/bash
OUT_DIR="$(dirname "$0")/../outbox"; mkdir -p "$OUT_DIR"; OUT="$OUT_DIR/smoke-real-prompt2.out"
DB="${MARIA_DB:?}"
{
cd /root/secretaria
export MARIA_MCP_ACTIONS=1
sqlite3 "$DB" "DELETE FROM hechos WHERE clave='_smoke_pref_cafe';"
echo "=== turno con PROMPT REAL (post-fix), pidiendo guardar un hecho ==="
timeout 200 node -e '
const usuarios = require("./usuarios");
const { construirPrompt } = require("./prompt-builder");
const cc = require("./claude-client");
(async () => {
  const u = usuarios.obtener(1);
  const entrada = { de: u.wa_cus || u.wa_lid, nombre: u.nombre, cuerpo: "Guardá en tu memoria con la clave _smoke_pref_cafe que tomo café cortado sin azúcar.", messageId: "smoke-real2", esUsuario: true, esMedia: false };
  try {
    const prompt = await construirPrompt({ usuario: u, canal: "whatsapp", entrada });
    const r = await cc.invocarClaudeJSON(prompt, { audit: { usuarioId: 1, canal: "whatsapp" } });
    const j = r && r.json ? r.json : r;
    console.log("RESP:", (j && (j.respuesta_a_usuario||j.respuesta)||"").toString().slice(0,160));
    console.log("ACCIONES_ARRAY:", JSON.stringify((j && j.acciones)||[]).slice(0,200));
  } catch (e) { console.log("ERR:", e.message); }
})();
' 2>&1 | tail -15
echo
echo "=== hecho creado por el TOOL? (si aparece = ADOPCIÓN OK con prompt real) ==="
sqlite3 -column -header "$DB" "SELECT id,clave,valor FROM hechos WHERE clave='_smoke_pref_cafe';"
sqlite3 "$DB" "DELETE FROM hechos WHERE clave='_smoke_pref_cafe';"
} > "$OUT" 2>&1
echo done >> "$OUT"
