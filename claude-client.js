// claude-client.js — wrapper sobre la CLI `claude -p`
//
// Envía el prompt por stdin (evita problemas de escaping con argv),
// lee stdout, y extrae el JSON de la respuesta (aunque venga envuelto en ```json ... ```).

const { spawn } = require('child_process');

const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude';

// Herramientas de Claude permitidas. Por default solo dejamos lo que Maria
// efectivamente necesita: web (info externa) + Read (visión multimodal de
// adjuntos en /tmp/maria-attach-*).
//
// IMPORTANTE: NO incluimos Bash/Edit/Write/NotebookEdit en allowed por
// default — son los que permitirían exfiltrar datos del VPS o modificar
// el propio código. Si te hace falta sumar (ej. mcp__playwright para sitios
// JS-only), hacelo explícito con CLAUDE_ALLOWED_TOOLS.
const ALLOWED_TOOLS = (process.env.CLAUDE_ALLOWED_TOOLS ?? 'WebSearch,WebFetch,Read')
  .split(',').map(s => s.trim()).filter(Boolean);

// Disallowlist explícita como cinturón de seguridad (defense in depth).
// Aunque ALLOWED_TOOLS ya no las incluya, las negamos por nombre por si
// Claude Code interpreta allowedTools de forma laxa o si una versión futura
// suma tools nuevas con permisos amplios.
const DISALLOWED_TOOLS = (process.env.CLAUDE_DISALLOWED_TOOLS ?? 'Bash,Edit,Write,NotebookEdit,KillShell,BashOutput,SlashCommand,Task')
  .split(',').map(s => s.trim()).filter(Boolean);

/**
 * Invoca `claude -p` con el prompt por stdin. Devuelve stdout (string).
 *
 * opts.audit = { usuarioId, canal } habilita auditoría: se loggea via
 * memory.logClaudeCall un evento sistema con tiempo, sizes y error si hubo.
 * Si no se pasa, no loguea (back-compat).
 */
function invocarClaude(prompt, { timeoutMs = 180000, extraArgs = [], audit = null } = {}) {
  const _t0 = Date.now();
  return new Promise((resolve, reject) => {
    const args = ['-p'];
    // --allowedTools/--disallowedTools en formato repeated (un flag por tool).
    // Es la forma más segura: la sintaxis "A B" en una sola string puede ser
    // interpretada como un único nombre de tool y dejar TODAS las demás
    // implícitamente disponibles.
    for (const t of ALLOWED_TOOLS) args.push('--allowedTools', t);
    for (const t of DISALLOWED_TOOLS) args.push('--disallowedTools', t);
    // MCP config: si existe el archivo (default ./mcp-config.json), lo cargamos.
    // Da acceso a Playwright MCP para navegación web interactiva (formularios,
    // sitios JS-only, paneles privados). El server se levanta lazy — solo
    // arranca si el LLM efectivamente invoca alguna tool del namespace.
    const fs = require('fs');
    const mcpCfg = process.env.CLAUDE_MCP_CONFIG || './mcp-config.json';
    if (fs.existsSync(mcpCfg)) {
      args.push('--mcp-config', mcpCfg);
    }
    // Settings file de Claude Code — para que distintas instancias usen
    // distintas cuentas (Pro/Max). Si no se setea, hereda la auth del VPS.
    // Para usar billing por API key, basta con setear ANTHROPIC_API_KEY en
    // el env de la instancia (pm2 lo inyecta y el spawn lo hereda).
    const settingsFile = process.env.CLAUDE_SETTINGS_FILE;
    if (settingsFile && fs.existsSync(settingsFile)) {
      args.push('--settings', settingsFile);
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

    function _audit(error_msg) {
      if (!audit) return;
      try {
        const mem = require('./memory'); // lazy para evitar circular
        mem.logClaudeCall({
          usuarioId: audit.usuarioId || null,
          canal: audit.canal || null,
          ms: Date.now() - _t0,
          prompt_chars: prompt.length,
          raw_chars: stdout.length,
          error_msg: error_msg || null,
        });
      } catch (e) {
        console.warn('[claude-client] audit falló:', e.message);
      }
    }

    p.on('error', err => { clearTimeout(to); _audit(err.message); reject(err); });
    p.on('close', code => {
      clearTimeout(to);
      if (code !== 0) {
        const msg = `claude exit ${code}: ${stderr.trim().slice(0,200)}`;
        _audit(msg);
        return reject(new Error(msg));
      }
      _audit(null);
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
