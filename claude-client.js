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
// Attachments: para cada archivo en `attachments[]`, lo bind-mounteamos
// read-only en su path. Cubre visión multimodal (imágenes/PDFs en
// /tmp/maria-attach-*). bwrap soporta --ro-bind tanto de archivos como de
// directorios; usamos archivos individuales para soportar el caso de
// múltiples adjuntos en un mismo mensaje.
function _argsBwrap({ attachments = [], extraBinds = [] } = {}) {
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
  // Attachments individuales (visión multimodal). Cada uno se monta read-only
  // en su path exacto (incluyendo extensión) para que Claude Code los lea con
  // su tool Read via @<path>.
  for (const att of attachments) {
    try {
      fs.accessSync(att, fs.constants.R_OK);
      args.push('--ro-bind', att, att);
    } catch (e) {
      console.warn(`[claude-client] attachment no accesible: ${att} (${e.message})`);
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

// Detecta paths de attachments en el prompt (formato: @/tmp/maria-attach-XYZ.ext
// o @/tmp/maria-attach-XYZ/foo.ext). Devuelve un array (puede ser vacío) con
// todos los paths únicos encontrados, para que cada uno se bind-mountee
// individualmente en el sandbox.
function _detectarAttachments(prompt) {
  // Aceptamos cualquier char válido de path (incluyendo `.` y `/` después del
  // primer segmento) hasta whitespace o fin de línea. Esto cubre tanto el caso
  // viejo (dir/archivo) como el actual (archivo con extensión).
  const re = /(\/tmp\/maria-attach-[A-Za-z0-9_.\/-]+)/g;
  const paths = new Set();
  let m;
  while ((m = re.exec(prompt)) !== null) paths.add(m[1]);
  return [...paths];
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
// El prompt puede ser:
//   - string (legacy): va entero por stdin
//   - { system, user } (split 2026-06-10): `system` va por --append-system-prompt
//     (bloque estático → entra al prefijo cacheable de la API; en ráfagas y en
//     el segundo turno de consultas se relee de cache en vez de re-procesarse),
//     `user` va por stdin (lo dinámico del turno).
function _partesPrompt(prompt) {
  if (prompt && typeof prompt === 'object' && (prompt.system || prompt.user)) {
    return { system: prompt.system || null, user: String(prompt.user || '') };
  }
  return { system: null, user: String(prompt ?? '') };
}

// Núcleo del wrapper. Resuelve { texto, sessionId } — sessionId es el
// session_id del evento result de stream-json (null si no hubo). Los
// exports públicos lo envuelven: invocarClaude sigue resolviendo string
// (back-compat con memoria-curada y cualquier caller legacy).
//
// Sesiones persistentes (2026-06-11, prompt caching cross-llamada):
//   opts.resumeId  → agrega `--resume <id>` y NO manda --append-system-prompt
//                    (las reglas ya viven en la historia de la sesión).
//                    Si el resume falla, el error sale con codigo='RESUME_FALLIDO'
//                    para que el caller rote la sesión (NUNCA reintentamos acá).
//   opts.sesion / opts.sesionTurno → solo logging: van al metrics del audit
//                    como sesion ('nueva'|'resume'|'off') y sesion_turno.
function _invocarClaudeCrudo(prompt, {
  timeoutMs = parseInt(process.env.CLAUDE_TIMEOUT_MS, 10) || 480000,        // 8 min global cap
  idleTimeoutMs = parseInt(process.env.CLAUDE_IDLE_TIMEOUT_MS, 10) || 90000, // 90s sin output → kill
  extraArgs = [], audit = null,
  resumeId = null, sesion = null, sesionTurno = null,
} = {}) {
  const _t0 = Date.now();
  const { system: systemTxt, user: userTxt } = _partesPrompt(prompt);
  // Tag de sesión para el audit (validar por logs que cache_read crece).
  const _sesMet = sesion ? { sesion, ...(sesionTurno != null ? { sesion_turno: sesionTurno } : {}) } : {};
  // Error tipado: resume fallido → el caller resetea la sesión y cae al
  // flujo de turno inicial. No distinguimos causa fina (session not found,
  // exit raro, is_error): cualquier fallo de un --resume invalida la sesión.
  const _errResume = (msg) => { const e = new Error(msg); e.codigo = 'RESUME_FALLIDO'; return e; };
  const totalChars = (systemTxt ? systemTxt.length : 0) + userTxt.length;
  return new Promise((resolve, reject) => {
    // stream-json (2026-06-09): la CLI emite eventos JSON por línea a medida
    // que avanza. Nos da: (a) output incremental → el idle-timeout deja de
    // depender de que el call entero termine; (b) TTFB real medible; (c) el
    // evento final type=result trae usage (tokens in/out, cache hits),
    // duration_api_ms y total_cost_usd → van al audit log para diagnosticar
    // latencia/costo. Killswitch: CLAUDE_STREAM_JSON=0 vuelve a texto plano.
    const STREAM_JSON = process.env.CLAUDE_STREAM_JSON !== '0';
    const args = ['-p'];
    if (STREAM_JSON) args.push('--output-format', 'stream-json', '--verbose');
    if (resumeId) {
      // Resumimos una sesión existente: el system ya está en su historia —
      // re-mandarlo lo duplicaría y rompería el prefijo cacheable.
      args.push('--resume', resumeId);
    } else if (systemTxt) {
      args.push('--append-system-prompt', systemTxt);
    }
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

    // ─── Acciones como tools MCP (ÚNICO camino desde 2026-07-03) ─────────────
    // Killswitch MARIA_MCP_ACTIONS retirado tras el trial (adopción 100%, 0
    // fallback en 48h). Rollback = branch pre-legacy-cleanup + revert.
    // Genera un mcp-config por TURNO apuntando al mcp-actions-server, con el
    // usuarioId/canal/start_ts del turno inyectados por env. El server pega a
    // la internal-api /accion → el executor corre en el proceso principal con
    // el runtime vivo. Default OFF: no toca el flujo JSON actual.
    let _mcpActionsTmp = null;
    const _mcpActionsOn = !!(audit && audit.usuarioId);
    if (_mcpActionsOn) {
      try {
        const os = require('os');
        const cfg = { mcpServers: { 'maria-actions': {
          command: process.execPath,
          args: [path.join(__dirname, 'mcp-actions-server.mjs')],
          env: {
            MARIA_INTERNAL_PORT:  String(process.env.ASISTENTE_INTERNAL_PORT || ''),
            MARIA_INTERNAL_SECRET: String(process.env.ASISTENTE_INTERNAL_SECRET || ''),
            MARIA_TURN_USUARIO_ID: String(audit.usuarioId),
            MARIA_TURN_CANAL:      String(audit.canal || 'whatsapp'),
            // turnStartTs del handler (para que pueda tomar los resultados con
            // la misma clave); fallback al t0 propio si no vino.
            MARIA_TURN_START_TS:   String(audit.turnStartTs || _t0),
            MARIA_TURN_CHAT_KEY:   String(audit.chatKey || ''),
            MARIA_TURN_TERCERO:    audit.turnoTercero ? '1' : '0',
          },
        } } };
        _mcpActionsTmp = path.join(os.tmpdir(), `maria-mcpcfg-${audit.usuarioId}-${_t0}.json`);
        fs.writeFileSync(_mcpActionsTmp, JSON.stringify(cfg));
        args.push('--allowedTools', 'mcp__maria-actions');
      } catch (e) {
        console.warn('[claude-client] no pude preparar mcp-config de acciones:', e.message);
        _mcpActionsTmp = null;
      }
    }

    let mcpCfgAbs = null;
    const mcpCfgRaw = process.env.CLAUDE_MCP_CONFIG || './mcp-config.json';
    const mcpCfgResolved = path.resolve(mcpCfgRaw);
    if (_mcpActionsTmp) {
      mcpCfgAbs = _mcpActionsTmp;
      args.push('--mcp-config', mcpCfgAbs);
    } else if (fs.existsSync(mcpCfgResolved)) {
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
      const attachments = _detectarAttachments(systemTxt ? systemTxt + '\n' + userTxt : userTxt);
      const extraBinds = [];
      // Bind-mountear el mcp-config para que claude pueda leerlo adentro.
      if (mcpCfgAbs) extraBinds.push({ src: mcpCfgAbs, dst: mcpCfgAbs, ro: true });
      // Para el MCP actions server: su código (+ node_modules + action-schemas)
      // y el binario de node tienen que ser accesibles adentro del sandbox.
      if (_mcpActionsTmp) {
        extraBinds.push({ src: __dirname, dst: __dirname, ro: true });
        extraBinds.push({ src: path.dirname(process.execPath), dst: path.dirname(process.execPath), ro: true });
      }
      // Settings file también si existe
      if (settingsFile && fs.existsSync(settingsFile)) {
        extraBinds.push({ src: path.resolve(settingsFile), dst: path.resolve(settingsFile), ro: true });
      }
      const bwrapArgs = _argsBwrap({ attachments, extraBinds });
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
    let _ttfbMs = null; // primer byte de stdout (≈ spawn CLI + queue + procesamiento de input)

    // Dos timers: global (cap absoluto) e idle (sin bytes por X). El idle se
    // resetea en cada chunk recibido — si Claude está streamiando output
    // progresivamente, no aborta arbitrariamente. Si Claude se cuelga
    // (no produce nada por idleTimeoutMs), corta rápido sin esperar el global.
    let killedByTimer = null; // 'global' | 'idle' | null
    const globalTo = setTimeout(() => {
      if (killedByTimer) return;
      killedByTimer = 'global';
      console.warn(`[claude-client] global timeout ${timeoutMs}ms — SIGKILL`);
      try { p.kill('SIGKILL'); } catch {}
    }, timeoutMs);
    let idleTo = null;
    function _resetIdle() {
      if (idleTo) clearTimeout(idleTo);
      idleTo = setTimeout(() => {
        if (killedByTimer) return;
        killedByTimer = 'idle';
        console.warn(`[claude-client] idle timeout ${idleTimeoutMs}ms sin output — SIGKILL (prompt=${totalChars}c, stdout=${stdout.length}c)`);
        try { p.kill('SIGKILL'); } catch {}
      }, idleTimeoutMs);
    }
    _resetIdle();

    p.stdout.on('data', d => {
      if (_ttfbMs === null) _ttfbMs = Date.now() - _t0;
      stdout += d.toString();
      _resetIdle();
    });
    p.stderr.on('data', d => { stderr += d.toString(); _resetIdle(); });

    // Parsea el stream-json: una línea JSON por evento; nos interesa el
    // último evento type=result (texto final + métricas). Devuelve null si
    // el output no es stream-json parseable (fallback a texto plano).
    function _parseStreamJson(out) {
      let result = null;
      for (const line of out.split('\n')) {
        const s = line.trim();
        if (!s || s[0] !== '{') continue;
        try {
          const obj = JSON.parse(s);
          if (obj && obj.type === 'result') result = obj;
        } catch {}
      }
      return result;
    }

    let _metrics = null; // se completa en close si hubo evento result

    function _audit(error_msg) {
      if (!audit) return;
      try {
        const mem = require('./memory'); // lazy para evitar circular
        mem.logClaudeCall({
          usuarioId: audit.usuarioId || null,
          canal: audit.canal || null,
          ms: Date.now() - _t0,
          prompt_chars: totalChars,
          raw_chars: stdout.length,
          error_msg: error_msg || null,
          metrics: (_metrics || _ttfbMs != null || sesion)
            ? { ...(_metrics || (_ttfbMs != null ? { ttfb_ms: _ttfbMs } : {})), ..._sesMet }
            : null,
        });
      } catch (e) {
        console.warn('[claude-client] audit falló:', e.message);
      }
    }

    function _cleanup() {
      clearTimeout(globalTo);
      if (idleTo) clearTimeout(idleTo);
      if (_mcpActionsTmp) { try { fs.unlinkSync(_mcpActionsTmp); } catch {} _mcpActionsTmp = null; }
    }
    p.on('error', err => { _cleanup(); _audit(err.message); reject(err); });
    p.on('close', code => {
      _cleanup();
      if (killedByTimer === 'global') {
        const msg = `Timeout global ${timeoutMs}ms invocando claude (prompt=${totalChars}c)`;
        _audit(msg);
        return reject(new Error(msg));
      }
      if (killedByTimer === 'idle') {
        const msg = `Idle timeout ${idleTimeoutMs}ms invocando claude (sin output por ese tiempo; prompt=${totalChars}c, stdout=${stdout.length}c)`;
        _audit(msg);
        return reject(new Error(msg));
      }
      if (code !== 0) {
        const msg = `claude exit ${code}: ${stderr.trim().slice(0,200)}`;
        _audit(msg);
        // Con --resume, un exit != 0 típico es "No conversation found with
        // session ID ..." — la sesión murió/no existe. Tipamos para que el
        // caller rote en vez de reintentar el resume.
        return reject(resumeId ? _errResume(msg) : new Error(msg));
      }
      // stream-json: extraer el texto final + métricas del evento result.
      if (STREAM_JSON) {
        const r = _parseStreamJson(stdout);
        if (r) {
          const u = r.usage || {};
          _metrics = {
            tokens_in: u.input_tokens ?? null,
            tokens_out: u.output_tokens ?? null,
            cache_read: u.cache_read_input_tokens ?? null,
            cache_creation: u.cache_creation_input_tokens ?? null,
            ttfb_ms: _ttfbMs,
            api_ms: r.duration_api_ms ?? null,
            cost_usd: r.total_cost_usd ?? null,
            num_turns: r.num_turns ?? null,
          };
          if (r.is_error) {
            const msg = `claude result error (${r.subtype || '?'}): ${String(r.result || '').slice(0, 200)}`;
            _audit(msg);
            // En modo resume cualquier result con error invalida la sesión
            // (incluye los "session not found") — tipado para que el caller rote.
            return reject(resumeId ? _errResume(msg) : new Error(msg));
          }
          _audit(null);
          return resolve({ texto: String(r.result ?? ''), sessionId: r.session_id || null });
        }
        // Sin evento result parseable → fallback: tratar stdout como texto
        // (cubre CLIs viejas que ignoren el flag o output inesperado).
        console.warn('[claude-client] stream-json sin evento result — fallback a stdout crudo');
      }
      _audit(null);
      resolve({ texto: stdout, sessionId: null });
    });

    p.stdin.write(userTxt);
    p.stdin.end();
  });
}

// Export público back-compat: resuelve STRING como siempre (memoria-curada
// y otros callers fuera de los handlers dependen de este contrato). Quien
// necesite el sessionId usa invocarClaudeJSON / invocarClaudeJSONConConsultas,
// que ahora lo devuelven como propiedad extra.
async function invocarClaude(prompt, opts = {}) {
  const { texto } = await _invocarClaudeCrudo(prompt, opts);
  return texto;
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
 * Devuelve { raw, json, sessionId } — sessionId del result de la CLI (o
 * null). Propiedad ADITIVA: los callers que destructuran { json } o
 * { json, raw } no se enteran.
 */
async function invocarClaudeJSON(prompt, opts = {}) {
  const { texto, sessionId } = await _invocarClaudeCrudo(prompt, opts);
  return { raw: texto, json: extraerJSON(texto), sessionId };
}

/**
 * Wrapper multi-turn: invoca Claude y, si la respuesta JSON trae un campo
 * `consultas` con items, las ejecuta y vuelve a llamar a Claude con los
 * resultados como contexto adicional. Devuelve el JSON del segundo call.
 *
 * Schema de consultas soportadas:
 *   { tipo: 'buscar_en_historial', query, canal?, dias?, max? }
 *
 * El consumidor (handlers de WA/Gmail) llama a esta función en vez de
 * invocarClaudeJSON directo y recibe el JSON final, agnóstico de si hubo
 * uno o dos calls internos.
 *
 * `consultaCtx` lleva el contexto necesario para ejecutar las consultas:
 *   { usuario }  — usuario al que pertenece la conversación (filtro de seguridad).
 */
async function invocarClaudeJSONConConsultas(prompt, consultaCtx, opts = {}) {
  const mem = require('./memory');

  // Primer turno
  const r1 = await invocarClaudeJSON(prompt, opts);
  const consultas = Array.isArray(r1.json?.consultas) ? r1.json.consultas : [];
  if (!consultas.length) {
    return r1;
  }

  if (!consultaCtx || !consultaCtx.usuario || !consultaCtx.usuario.id) {
    console.warn('[claude-client] consultas emitidas pero no hay consultaCtx.usuario — no se ejecutan');
    return r1;
  }

  // Ejecutar consultas
  const usuarioId = consultaCtx.usuario.id;
  const seccionesResultado = [];
  for (const c of consultas) {
    try {
      if (c.tipo === 'buscar_en_historial') {
        const filas = mem.buscarEnHistorial({
          usuarioId,
          query: c.query,
          canal: c.canal || null,
          dias: c.dias || 30,
          max: c.max || 20,
        });
        const header = `[CONSULTA: buscar_en_historial query="${c.query}" canal=${c.canal || '*'} dias=${c.dias || 30} → ${filas.length} resultados]`;
        if (!filas.length) {
          seccionesResultado.push(`${header}\n(sin resultados)`);
        } else {
          const lineas = filas.map(f => mem.formatearParaPrompt ? mem.formatearParaPrompt(f) : `[${f.timestamp}] ${f.direccion} ${f.canal} ${(f.nombre || f.de || '?')}: ${(f.cuerpo || '').replace(/\s+/g, ' ').slice(0, 240)}`);
          seccionesResultado.push(`${header}\n${lineas.join('\n')}`);
        }
        console.log(`[claude-client] consulta buscar_en_historial("${c.query}") → ${filas.length} resultados`);
      } else if (c.tipo === 'buscar_contacto') {
        const matches = mem.buscarContactosVisibles(usuarioId, c.query, { max: 10 });
        const header = `[CONSULTA: buscar_contacto query="${c.query}" → ${matches.length} match(es)]`;
        if (!matches.length) {
          seccionesResultado.push(`${header}\n(sin matches en la libreta — el contacto NO está cargado; pedile el dato al usuario o sugerí upsert_contacto)`);
        } else {
          const lineas = matches.map(m => {
            const campos = [m.nombre];
            if (m.whatsapp) campos.push(`WA: ${m.whatsapp}`);
            if (m.email)    campos.push(`email: ${m.email}`);
            if (m.cumple)   campos.push(`cumple: ${m.cumple}`);
            if (m.notas)    campos.push(`(${m.notas})`);
            return '- ' + campos.join(' | ');
          });
          seccionesResultado.push(`${header}\n${lineas.join('\n')}`);
        }
        console.log(`[claude-client] consulta buscar_contacto("${c.query}") → ${matches.length} matches`);
      } else if (c.tipo === 'verificar_respuesta') {
        const dias = Math.min(Math.max(1, Number(c.dias) || 30), 180);
        const desde = new Date(Date.now() - dias * 24 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19);
        const filas = mem.listarEntrantesDe({ usuarioId, de: c.de, desde, max: 5 });
        const header = `[CONSULTA: verificar_respuesta de="${c.de}" dias=${dias}]`;
        if (!filas.length) {
          seccionesResultado.push(`${header}\nVEREDICTO DEL SISTEMA (calculado por código sobre la base, NO opinable): "${c.de}" NO mandó NINGÚN mensaje entrante en los últimos ${dias} días, por ningún canal. Esa persona NO respondió. Respondé en consecuencia — no afirmes que respondió/confirmó/propuso algo.`);
        } else {
          const lineas = filas.map(f => `[${String(f.timestamp).slice(0, 16)} UTC · ${f.canal}] ${(f.asunto ? f.asunto + ' — ' : '')}${String(f.cuerpo || '').replace(/\s+/g, ' ').slice(0, 300)}`);
          seccionesResultado.push(`${header}\nVEREDICTO DEL SISTEMA: SÍ hay ${filas.length} mensaje(s) entrante(s) de "${c.de}" (más recientes primero, textuales):\n${lineas.join('\n')}`);
        }
        console.log(`[claude-client] consulta verificar_respuesta("${c.de}") → ${filas.length} entrantes`);
      } else {
        seccionesResultado.push(`[CONSULTA: tipo desconocido "${c.tipo}" — ignorada]`);
        console.warn(`[claude-client] tipo de consulta desconocido: ${c.tipo}`);
      }
    } catch (err) {
      seccionesResultado.push(`[CONSULTA: ${c.tipo} falló — ${err.message}]`);
      console.warn(`[claude-client] consulta ${c.tipo} falló: ${err.message}`);
    }
  }

  // Segundo turno: original + resultados. Si el prompt es split {system,user},
  // el sufijo va en `user` y el system queda IDÉNTICO → cache hit en la API.
  const cuerpoResultados = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'
    + '[RESULTADOS DE TUS CONSULTAS]\n'
    + 'Las consultas que pediste en el turno anterior devolvieron:\n\n'
    + seccionesResultado.join('\n\n')
    + '\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'
    + 'Con esta información, ahora generá la respuesta final al usuario. '
    + 'NO incluyas `consultas` en este turno (ya fueron ejecutadas). '
    + 'Razoná con los resultados y emití respuesta_a_usuario / respuesta_a_remitente / acciones según corresponda.';

  // Modo sesión (2026-06-11): si el primer call dejó una sesión viva (el
  // handler corre con MARIA_SESIONES=1, sea turno inicial o resume), el
  // segundo call RESUME esa sesión y manda SOLO los resultados — el prompt
  // del turno ya está en la historia, re-mandarlo sería pagar todo de nuevo.
  const modoSesion = opts.sesion === 'nueva' || opts.sesion === 'resume' || !!opts.resumeId;
  let prompt2, opts2;
  if (modoSesion && r1.sessionId) {
    prompt2 = cuerpoResultados;
    opts2 = { ...opts, resumeId: r1.sessionId };
  } else {
    prompt2 = (prompt && typeof prompt === 'object' && (prompt.system || prompt.user))
      ? { system: prompt.system, user: (prompt.user || '') + '\n\n' + cuerpoResultados }
      : prompt + '\n\n' + cuerpoResultados;
    opts2 = opts;
  }

  const r2 = await invocarClaudeJSON(prompt2, opts2);
  // sessionId: el del ÚLTIMO call (cada --resume emite un session_id nuevo
  // que es el que hay que persistir para el próximo turno).
  return { raw: r2.raw, json: r2.json, sessionId: r2.sessionId || r1.sessionId, primerTurno: r1.json, consultas };
}

module.exports = {
  invocarClaude,
  invocarClaudeJSON,
  invocarClaudeJSONConConsultas,
  extraerJSON,
};
