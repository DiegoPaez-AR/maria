#!/bin/bash
OUT_DIR="$(dirname "$0")/../outbox"; mkdir -p "$OUT_DIR"; OUT="$OUT_DIR/verify-mcp-sdk.out"
{
cd /root/secretaria
echo "node: $(node -v)"
echo "=== instalado? ==="
ls -d node_modules/@modelcontextprotocol/sdk 2>&1
echo "=== version + engines ==="
node -e "const p=require('./node_modules/@modelcontextprotocol/sdk/package.json'); console.log('version', p.version, 'engines', JSON.stringify(p.engines))" 2>&1
echo "=== test imports desde /root/secretaria ==="
cat > ./_mcptest.mjs <<'JS'
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
console.log('imports OK:', typeof Server, typeof StdioServerTransport, !!ListToolsRequestSchema, !!CallToolRequestSchema);
JS
node ./_mcptest.mjs 2>&1
rm -f ./_mcptest.mjs
echo "=== fetch global disponible en node18? ==="
node -e "console.log('fetch:', typeof fetch)" 2>&1
} > "$OUT" 2>&1
echo done >> "$OUT"
