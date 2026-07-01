#!/bin/bash
OUT_DIR="$(dirname "$0")/../outbox"; mkdir -p "$OUT_DIR"; OUT="$OUT_DIR/smoke-mcp-2c.out"
DB="${MARIA_DB:?}"
{
cd /root/secretaria
export MARIA_MCP_ACTIONS=1
echo "node=$(node -v) MCP=$MARIA_MCP_ACTIONS port=$ASISTENTE_INTERNAL_PORT"
sqlite3 "$DB" "DELETE FROM hechos WHERE clave='_smoke_mcp_2c';"
echo "=== invocar claude-client (MCP ON) pidiendo un tool call ==="
timeout 180 node -e '
const cc = require("./claude-client");
(async () => {
  const prompt = "Tenés tools mcp__maria-actions__*. Ejecutá el tool mcp__maria-actions__recordar_hecho con clave \"_smoke_mcp_2c\", valor \"ok\", fuente \"smoke\". Cuando el tool devuelva ok, respondé unicamente: LISTO.";
  try {
    const r = await cc.invocarClaude(prompt, { audit: { usuarioId: 1, canal: "whatsapp" } });
    console.log("CLAUDE_OUT:", String(r).slice(0,500));
  } catch (e) { console.log("CLAUDE_ERR:", e.message); }
})();
' 2>&1 | tail -25
echo
echo "=== hecho creado por el tool? (si aparece = camino MCP OK) ==="
sqlite3 -column -header "$DB" "SELECT id,usuario_id,clave,valor,fuente FROM hechos WHERE clave='_smoke_mcp_2c';"
echo "=== limpiar ==="
sqlite3 "$DB" "DELETE FROM hechos WHERE clave='_smoke_mcp_2c';"
} > "$OUT" 2>&1
echo done >> "$OUT"
