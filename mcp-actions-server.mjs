// mcp-actions-server.mjs — MCP stdio server que expone las acciones de Maria
// como tools (fase 2, killswitch MARIA_MCP_ACTIONS). Lo spawnea el CLI de
// Claude Code vía --mcp-config. Cada tools/call → POST a la internal-api
// (127.0.0.1) → el executor corre en el proceso principal con el runtime vivo.
//
// Env que inyecta claude-client por turno:
//   MARIA_INTERNAL_PORT    puerto de la internal-api
//   MARIA_INTERNAL_SECRET  X-Intensa-Secret
//   MARIA_TURN_USUARIO_ID  usuario del turno
//   MARIA_TURN_CANAL       canal origen (whatsapp|gmail), default whatsapp
//   MARIA_TURN_START_TS    epoch ms del inicio del turno (guard turno-viejo)

import http from 'node:http';
import { createRequire } from 'node:module';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const require = createRequire(import.meta.url);
const { TOOLS } = require('./action-schemas.js');

const PORT      = Number(process.env.MARIA_INTERNAL_PORT || 0);
const SECRET    = process.env.MARIA_INTERNAL_SECRET || '';
const USUARIO   = process.env.MARIA_TURN_USUARIO_ID ? Number(process.env.MARIA_TURN_USUARIO_ID) : null;
const CANAL     = process.env.MARIA_TURN_CANAL || 'whatsapp';
const START_TS  = process.env.MARIA_TURN_START_TS ? Number(process.env.MARIA_TURN_START_TS) : null;

function postAccion(accion) {
  return new Promise((resolve) => {
    if (!PORT || !SECRET || !USUARIO) {
      return resolve({ ok: false, error: 'mcp-actions-server: falta config (port/secret/usuarioId)' });
    }
    const payload = JSON.stringify({ usuarioId: USUARIO, accion, canalOrigen: CANAL, turnStartTs: START_TS });
    const req = http.request(
      { host: '127.0.0.1', port: PORT, path: '/accion', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), 'X-Intensa-Secret': SECRET },
        timeout: 90000 },
      (res) => {
        let b = '';
        res.on('data', (d) => { b += d; });
        res.on('end', () => {
          try { resolve(JSON.parse(b)); }
          catch { resolve({ ok: false, error: `/accion devolvió no-JSON (${res.statusCode}): ${b.slice(0, 300)}` }); }
        });
      });
    req.on('error', (e) => resolve({ ok: false, error: `internal-api inalcanzable: ${e.message}` }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: '/accion timeout (90s)' }); });
    req.write(payload); req.end();
  });
}

const server = new Server(
  { name: 'maria-actions', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;
  const accion = { tipo: name, ...args };
  const result = await postAccion(accion);
  const ok = !!(result && result.ok);
  return {
    content: [{ type: 'text', text: JSON.stringify(result) }],
    isError: !ok,
  };
});

const transport = new StdioServerTransport();
await server.connect(transport);
// stderr para no ensuciar el stdout (que es el canal JSON-RPC del protocolo).
console.error('[mcp-actions-server] listo (usuarioId=' + USUARIO + ', port=' + PORT + ')');
