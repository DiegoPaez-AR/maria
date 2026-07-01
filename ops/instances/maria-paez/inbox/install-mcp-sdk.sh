#!/bin/bash
OUT_DIR="$(dirname "$0")/../outbox"; mkdir -p "$OUT_DIR"; OUT="$OUT_DIR/install-mcp-sdk.out"
{
cd /root/secretaria
echo "node: $(node -v)"
echo "=== npm install @modelcontextprotocol/sdk ==="
npm install @modelcontextprotocol/sdk 2>&1 | tail -8
echo "=== version instalada ==="
node -e "console.log(require('@modelcontextprotocol/sdk/package.json').version)"
echo "=== test imports (ESM) ==="
cat > /tmp/_mcptest.mjs <<'JS'
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
console.log('imports OK:', typeof Server, typeof StdioServerTransport, typeof ListToolsRequestSchema, typeof CallToolRequestSchema);
JS
node /tmp/_mcptest.mjs 2>&1
rm -f /tmp/_mcptest.mjs
} > "$OUT" 2>&1
echo done >> "$OUT"
