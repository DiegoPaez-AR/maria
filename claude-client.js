// claude-client.js — wrapper sobre la CLI `claude -p`
//
// Envía el prompt por stdin (evita problemas de escaping con argv),
// lee stdout, y extrae el JSON de la respuesta (aunque venga envuelto en ```json ... ```).

const { spawn } = require('child_process');
const fs = require('fs');

const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude';

// Capa 4 — sandbox del subproceso de Claude con bubblewrap (bwrap).
// Si bwrap está instalado y CLAUDE_NO_SANDBOX !== '1', envolvemos cada
// invocación de claude en un namespace donde NO ve /root/secretaria/, ni
// /root/.ssh, ni /etc/shadow, ni el resto del filesystem real. Solo ve los
// paths que necesita: su propia auth, libs del sistema, y attachments
// específicos que la app le quiera mostrar.
//
// Detección del binario: cacheada al boot del módulo. Si bwrap aparece
// después de iniciado el proceso, hay que reiniciarlo.
const BWRAP_BIN = (() => {
  if (process.env.CLAUDE_NO_SANDBOX === '1') return null;
  for (const cand of ['/usr/bin/bwrap', '/usr/local/bin/bwrap']) {
    try { fs.accessSync(cand, fs.constants.X_OK); return cand; } catch {}
  }
  return null; // no instalado → fallback a spawn directo (con warning una vez)
})();

let _avisoSandboxOff = false;
function _avisarSandboxOff() {
  if (_avisoSandboxOff) return;
  _avisoSandboxOff = true;
  console.warn('[claude-client] ⚠ bwrap no disponible — claude corre SIN sandbox. ' +
               'Instalá bubblewrap (apt install -y bubblewrap) para activar Capa 4.');
}

// Construye los argumentos de bwrap para una invocación dada.
// Bind-mounts:
//   read-only: /usr, /lib, /lib64, /bin, /sbin (binarios y libs del sistema)
//              /etc/{resolv.conf, ssl, ca-certificates, nsswitch.conf, hosts, passwd, group}
//   read-write (Claude actualiza state): /root/.claude/, /root/.cache/claude-cli-nodejs/
//   read-only: /root/.claude.json
// Tmpfs (sin contenido): /home, /var, /opt, /srv, /mnt, /media
// Attachments: si attachmentsDir está, lo bind-mounteamos read-only en su path.
//   Esto cubre el caso de visión multimodal (imágenes/PDFs en /tmp/maria-attach-*).
function _argsBwrap({ attachmentsDir = null, extraBinds = [] } = {}) {
  const args = [
    '--unshare-all', '--share-net',  // aislamos namespaces, mantenemos red (claude llama a la API)
    '--proc', '/proc',
    '--dev', '/dev',
    '--tmpfs', '/tmp',
    '--tmpfs', '/home',
    '--tmpfs', '/var',
    '--tmpfs', '/opt',
    '--tmpfs', '/srv',
    '--tmpfs', '/mnt',
    '--tmpfs', '/media',
    '--ro-bind', '/usr', '/usr',
    '--ro-bind', '/bin', '/bin',
    '--ro-bind', '/sbin', '/sbin',
    '--ro-bind', '/etc/resolv.conf', '/etc/resolv.conf',
    '--ro-bind', '/etc/ssl', '/etc/ssl',
    '--ro-bind', '/etc/ca-certificates', '/etc/ca-certificates',
    '--ro-bind', '/etc/nsswitch.conf', '/etc/nsswitch.conf',
    '--ro-bind', '/etc/hosts', '/etc/hosts',
    '--ro-bind', '/etc/passwd', '/etc/passwd',
    '--ro-bind', '/etc/group', '/etc/group',
    '--bind',    '/root/.claude', '/root/.claude',
    '--ro-bind', '/root/.claude.json', '/root/.claude.json',
    '--bind',    '/root/.cache/claude-cli-nodejs', '/root/.cache/claude-cli-nodejs',
    '--setenv', 'HOME', '/root',
    '--setenv', 'PATH', '/usr/local/bin:/usr/bin:/bin',
  ];
  // /lib y /lib64 no siempre existen como dirs reales (en algunos sistemas son
  // symlinks a /usr/lib). Solo agregamos si existen para no romper bwrap.
  for (const dir of ['/lib', '/lib64']) {
    try { fs.accessSync(dir, fs.constants.R_OK); args.push('--ro-bind', dir, dir); } catch {}
  }
  // Attachment dir específico para esta invocación (visión multimodal).
  if (attachmentsDir) {
    try {
      fs.accessSync(attachmentsDir, fs.constants.R_OK);
      args.push('--ro-bind', attachmentsDir, attachmentsDir);
    } catch (e) {
      console.warn(`[claude-client] attachmentsDir no accesible: ${attachmentsDir} (${e.message})`);
    }
  }
  // Binds extra (mcp-config, settings file, etc.).
  for (const b of extraBinds) {
    try {
      fs.accessSync(b.src, fs.constants.R_OK);
      args.push(b.ro ? '--ro-bind' : '--bind', b.src, b.dst || b.src);
    } catch (e) {
      console.warn(`[claude-client] extra bind no accesible: ${b.src} (${e.message})`);
    }
  }
  return args;
}

// Detecta paths de attachments en el prompt (formato típico: @/tmp/maria-attach-XYZ/foo.png).
// Devuelve el dir padre común si todos los attachments comparten dir, sino null
// (en cuyo caso usa estrategia fallback más permisiva).
function _detectarAttachmentsDir(prompt) {
  const re = /(\/tmp\/maria-attach-[A-Za-z0-9_-]+)/g;
  const dirs = new Set();
  let m;
  while ((m = re.exec(prompt)) !== null) dirs.add(m[1]);
  if (dirs.size === 0) return null;
  if (dirs.size === 1) return [...dirs][0];
  // Múltiples attachment dirs: por seguridad bind solo el primero. Si esto
  // empieza a romper visión multimodal con múltiples adjuntos en mensajes
  // distintos, vemos de bind-mountear /tmp/ entero (compromiso).
  console.warn(`[claude-client] múltiples attachment dirs en prompt: ${[...dirs].join(', ')} — bind solo el primero`);
  return [...dirs][0];
}

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
    // Resolvemos a path absoluto para que sea accesible adentro del sandbox.
    // El path se va a bind-mountear más abajo si bwrap está activo.
    const path = require('path');
    let mcpCfgAbs = null;
    const mcpCfgRaw = process.env.CLAUDE_MCP_CONFIG || './mcp-config.json';
    const mcpCfgResolved = path.resolve(mcpCfgRaw);
    if (fs.existsSync(mcpCfgResolved)) {
      mcpCfgAbs = mcpCfgResolved;
      args.push('--mcp-config', mcpCfgAbs);
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

    // ─── Sandbox via bwrap si está disponible ────────────────────────────
    let cmd, finalArgs;
    if (BWRAP_BIN) {
      const attachDir = _detectarAttachmentsDir(prompt);
      const extraBinds = [];
      // Bind-mountear el mcp-config para que claude pueda leerlo adentro.
      if (mcpCfgAbs) extraBinds.push({ src: mcpCfgAbs, dst: mcpCfgAbs, ro: true });
      // Settings file también si existe
      if (settingsFile && fs.existsSync(settingsFile)) {
        extraBinds.push({ src: path.resolve(settingsFile), dst: path.resolve(settingsFile), ro: true });
      }
      const bwrapArgs = _argsBwrap({ attachmentsDir: attachDir, extraBinds });
      // chdir a /root (que existe en el sandbox) para evitar cwd inexistente
      bwrapArgs.push('--chdir', '/root');
      finalArgs = [...bwrapArgs, '--', CLAUDE_BIN, ...args];
      cmd = BWRAP_BIN;
    } else {
      _avisarSandboxOff();
      cmd = CLAUDE_BIN;
      finalArgs = args;
    }

    const p = spawn(cmd, finalArgs, { stdio: ['pipe', 'pipe', 'pipe'] });
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
