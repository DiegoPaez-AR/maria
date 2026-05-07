#!/bin/bash
set +e

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

PROMPT='Usá Playwright MCP. 
1) Navegá a https://buenosaires.gob.ar/licenciasdeconducir/consulta-de-infracciones/?actas=transito
2) Seleccioná el radio "una patente"
3) Ingresá la patente "AD4090WX" en el input
4) Click en "Consultar"  
5) Esperá el resultado o el captcha bloqueante.
6) Devolveme un JSON: {"resultado":"ok"|"captcha_bloqueado"|"otro","detalle":"...lo que pasó..."}
Sin texto extra fuera del JSON.'

echo "$PROMPT" | timeout 240 claude -p \
  --mcp-config /tmp/mcp-playwright.json \
  --allowedTools "mcp__playwright" \
  2>&1 | tail -40
echo "exit=$?"
rm -f /tmp/mcp-playwright.json
