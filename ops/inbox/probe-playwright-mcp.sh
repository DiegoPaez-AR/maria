#!/bin/bash
set +e

echo "── 1. claude --version ──"
claude --version 2>&1
echo

echo "── 2. flags MCP-related en --help ──"
claude --help 2>&1 | grep -iE 'mcp|tool|allowed|permission' | head -20
echo

echo "── 3. Verificar que npx + @playwright/mcp pueden instalarse/correr ──"
# El primer call de npx descarga el paquete. Lo hacemos con un timeout corto
# para verificar que arranca, sin esperar el listen.
echo "  warmup: npx @playwright/mcp@latest --help"
timeout 60 npx -y @playwright/mcp@latest --help 2>&1 | head -30
echo "  warmup exit=$?"
echo

echo "── 4. Crear mcp-config.json ──"
cat > /tmp/mcp-playwright.json <<'JSON'
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["-y", "@playwright/mcp@latest", "--headless"]
    }
  }
}
JSON
cat /tmp/mcp-playwright.json
echo

echo "── 5. PRUEBA: claude -p con MCP playwright ──"
# Siguiendo la doc: hay que mencionar 'Playwright MCP' en el prompt para que
# Claude no caiga en Bash u otra cosa. Tools: tenemos que permitir mcp__playwright__*
PROMPT='Usá la tool Playwright MCP para navegar a https://buenosaires.gob.ar/licenciasdeconducir/consulta-de-infracciones/?actas=transito y describime brevemente qué elementos de formulario ves en la página (botones, inputs, dropdowns). Respondé en 5 líneas máximo.'
echo "$PROMPT" | timeout 240 claude -p \
  --mcp-config /tmp/mcp-playwright.json \
  --allowedTools "mcp__playwright" \
  2>&1 | tail -60
echo "  exit=$?"
echo

echo "── 6. cleanup ──"
rm -f /tmp/mcp-playwright.json
