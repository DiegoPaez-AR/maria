// claude-client.js — wrapper sobre la CLI `claude -p`
//
// Envía el prompt por stdin (evita problemas de escaping con argv),
// lee stdout, y extrae el JSON de la respuesta (aunque venga envuelto en ```json ... ```).

const { spawn } = require('child_process');

const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude';

// Herramientas de Claude permitidas. Por default dejamos las web para que
// Maria pueda buscar info (teléfonos de restaurantes, direcciones, horarios).
// Si querés sumar más o restar, seteá CLAUDE_ALLOWED_TOOLS="WebSearch,WebFetch".
const ALLOWED_TOOLS = (process.env.CLAUDE_ALLOWED_TOOLS ?? 'WebSearch,WebFetch,Read,mcp__playwright')
  .split(',').map(s => s.trim()).filter(Boolean);

/**
 * Invoca `claude -p` con el prompt por stdin. Devuelve stdout (string).
 */
function invocarClaude(prompt, { timeoutMs = 180000, extraArgs = [] } = {}) {
  return new Promise((resolve, reject) => {
    const args = ['-p'];
    if (ALLOWED_TOOLS.length) {
      // Claude Code acepta `--allowedTools "A B"` o `--allowedTools A --allowedTools B`.
      // Usamos la forma plural separada por espacios para robustez.
      args.push('--allowedTools', ALLOWED_TOOLS.join(' '));
    }
    // MCP config: si existe el archivo (default ./mcp-config.json), lo cargamos.
    // Da acceso a Playwright MCP para navegación web interactiva (formularios,
    // sitios JS-only, paneles privados). El server se levanta lazy — solo
    // arranca si el LLM efectivamente invoca alguna tool del namespace.
    const fs = require('fs');
    const mcpCfg = process.env.CLAUDE_MCP_CONFIG || './mcp-config.json';
    if (fs.existsSync(mcpCfg)) {
      args.push('--mcp-config', mcpCfg);
    }
    args.push(...extraArgs);
    const p = spawn(CLAUDE_BIN, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';

    const to = setTimeout(() => {
      p.kill('SIGKILL');
      reject(new Error(`Timeout ${timeoutMs}ms invocando claude`));
    }, timeoutMs);

    p.stdout.on('data', d => stdout += d.toString());
    p.stderr.on('data', d => stderr += d.toString());
    p.on('error', err => { clearTimeout(to); reject(err); });
    p.on('close', code => {
      clearTimeout(to);
      if (code !== 0) return reject(new Error(`claude exit ${code}: ${stderr.trim()}`));
      resolve(stdout);
    });

    p.stdin.write(prompt);
    p.stdin.end();
  });
}

/**
 * Extrae un objeto JSON del output de Claude. Maneja:
 * - JSON pelado
 * - JSON envuelto en ```json ... ``` o ``` ... ```
 * - Texto suelto antes/después del bloque JSON
 */
// Heurística: dentro de strings JSON, escapa comillas dobles internas que
// no estén ya escapadas. Camina char por char tracking si estamos dentro
// de un string. Cuando ve una `"` interna, mira el siguiente char no-ws:
// si es delimitador (`,`, `:`, `}`, `]`), es cierre legítimo. Si no, es
// comilla interna mal escapada y la transforma en `\"`.
//
// Cubre el caso típico de Claude alucinando JSON donde un valor string
// tiene comillas internas sin escapar (ej. `"texto con "interna" y más"`).
function _repararJSONComillasInternas(s) {
  let out = '';
  let inString = false;
  let prev = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"' && prev !== '\\') {
      if (!inString) {
        inString = true;
        out += c;
      } else {
        // Lookahead: ignorar whitespace, ver siguiente char significativo.
        let j = i + 1;
        while (j < s.length && /\s/.test(s[j])) j++;
        const next = s[j] || '';
        if (',:}]'.includes(next)) {
          // Cierre legítimo del string.
          inString = false;
          out += c;
        } else {
          // Comilla interna sin escape → la escapamos.
          out += '\\"';
        }
      }
    } else {
      out += c;
    }
    prev = c;
  }
  return out;
}

function extraerJSON(texto) {
  if (!texto) throw new Error('extraerJSON: texto vacío');
  texto = texto.trim();

  // 1) Intento directo
  try { return JSON.parse(texto); } catch {}

  // 2) Extraer de code fence ```json ... ``` o ``` ... ```
  const fence = texto.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) {
    try { return JSON.parse(fence[1].trim()); } catch {}
  }

  // 3) Buscar el primer { ... } balanceado
  const start = texto.indexOf('{');
  const end   = texto.lastIndexOf('}');
  let candidato = null;
  if (start !== -1 && end !== -1 && end > start) {
    candidato = texto.slice(start, end + 1);
    try { return JSON.parse(candidato); } catch {}
  }

  // 4) Reparación de comillas internas mal escapadas. Aplicamos sobre los
  // mejores candidatos (fence content si lo hubo, sino el balanceado).
  const intentos = [];
  if (fence) intentos.push(fence[1].trim());
  if (candidato) intentos.push(candidato);
  intentos.push(texto);
  for (const c of intentos) {
    try {
      const reparado = _repararJSONComillasInternas(c);
      return JSON.parse(reparado);
    } catch {}
  }

  throw new Error(`No se pudo extraer JSON de la respuesta de Claude:\n${texto.slice(0, 500)}`);
}

/**
 * Conveniencia: invoca + parsea JSON en una sola llamada.
 */
async function invocarClaudeJSON(prompt, opts = {}) {
  const out = await invocarClaude(prompt, opts);
  return { raw: out, json: extraerJSON(out) };
}

module.exports = {
  invocarClaude,
  invocarClaudeJSON,
  extraerJSON,
};
