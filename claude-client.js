// claude-client.js — wrapper sobre la CLI `claude -p`
//
// Envía el prompt por stdin (evita problemas de escaping con argv),
// lee stdout, y extrae el JSON de la respuesta (aunque venga envuelto en ```json ... ```).

const { spawn } = require('child_process');

const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude';

// Herramientas de Claude permitidas. Por default dejamos las web para que
// Maria pueda buscar info (teléfonos de restaurantes, direcciones, horarios).
// Si querés sumar más o restar, seteá CLAUDE_ALLOWED_TOOLS="WebSearch,WebFetch".
const ALLOWED_TOOLS = (process.env.CLAUDE_ALLOWED_TOOLS ?? 'WebSearch,WebFetch')
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
  if (start !== -1 && end !== -1 && end > start) {
    const candidato = texto.slice(start, end + 1);
    try { return JSON.parse(candidato); } catch {}
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
