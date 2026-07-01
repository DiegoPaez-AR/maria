#!/bin/bash
OUT_DIR="$(dirname "$0")/../outbox"; mkdir -p "$OUT_DIR"; OUT="$OUT_DIR/probe-split.out"
DB="${MARIA_DB:?}"
{
cd /root/secretaria
export MARIA_MCP_ACTIONS=1
sqlite3 "$DB" "DELETE FROM hechos WHERE clave IN ('_probe_str','_probe_split');"
echo "=== PROBE A: invocarClaudeJSON + STRING prompt, instruccion directa ==="
timeout 150 node -e '
const cc = require("./claude-client");
(async () => {
  const p = "Tenés tools mcp__maria-actions__*. Llamá al tool mcp__maria-actions__recordar_hecho con clave \"_probe_str\", valor \"ok\", fuente \"probe\". Después devolvé SOLO este JSON: {\"respuesta_a_usuario\":\"listo\"}";
  try { const r = await cc.invocarClaudeJSON(p, { audit:{usuarioId:1,canal:"whatsapp"} }); console.log("A json:", JSON.stringify(r.json).slice(0,120)); } catch(e){ console.log("A ERR:", e.message); }
})();' 2>&1 | tail -6
echo "hecho _probe_str:"; sqlite3 "$DB" "SELECT clave FROM hechos WHERE clave='_probe_str';"
echo
echo "=== PROBE B: invocarClaudeJSON + {system,user} SPLIT, instruccion directa ==="
timeout 150 node -e '
const cc = require("./claude-client");
(async () => {
  const prompt = { system: "Sos un asistente. Tenés tools mcp__maria-actions__*. Para guardar un hecho usás el tool mcp__maria-actions__recordar_hecho.", user: "Llamá al tool mcp__maria-actions__recordar_hecho con clave \"_probe_split\", valor \"ok\", fuente \"probe\". Después devolvé SOLO: {\"respuesta_a_usuario\":\"listo\"}" };
  try { const r = await cc.invocarClaudeJSON(prompt, { audit:{usuarioId:1,canal:"whatsapp"} }); console.log("B json:", JSON.stringify(r.json).slice(0,120)); } catch(e){ console.log("B ERR:", e.message); }
})();' 2>&1 | tail -6
echo "hecho _probe_split:"; sqlite3 "$DB" "SELECT clave FROM hechos WHERE clave='_probe_split';"
sqlite3 "$DB" "DELETE FROM hechos WHERE clave IN ('_probe_str','_probe_split');"
} > "$OUT" 2>&1
echo done >> "$OUT"
