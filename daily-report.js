// daily-report.js — corre 1 vez al día (cron 06:00 ART) e itera todas las
// instancias multi-instance. Para cada una arma stats de las últimas 24h
// (estado pm2, volumen WA/Gmail/Calendar, errores, pendientes) y manda
// un email único agregado al owner del VPS.
//
// La cuenta gmail desde la que se envía es la de la primera instancia
// encontrada en config/instances/*.conf (asumimos que esa es la "admin"
// que tiene OAuth válido). El destinatario es OWNER_EMAIL del .conf de
// esa instancia.
//
// Uso:
//   node daily-report.js                    # corre y manda
//   DRY_RUN=1 node daily-report.js          # solo imprime, no manda

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const Database = require('better-sqlite3');

const ROOT = __dirname;
const INSTANCES_DIR = path.join(ROOT, 'config', 'instances');
const DRY_RUN = !!process.env.DRY_RUN;

// ─── Helpers ──────────────────────────────────────────────────────────────

function parseConf(file) {
  const env = {};
  for (let line of fs.readFileSync(file, 'utf8').split('\n')) {
    line = line.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    env[k] = v;
  }
  return env;
}

function listarConfs() {
  if (!fs.existsSync(INSTANCES_DIR)) return [];
  return fs.readdirSync(INSTANCES_DIR)
    .filter(f => f.endsWith('.conf'))
    .map(f => path.join(INSTANCES_DIR, f))
    .sort();
}

function fmtUptime(ms) {
  if (!ms) return '?';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function pad(s, n) { return String(s).padEnd(n); }

function fmtMs(ms) {
  if (ms == null) return '?';
  if (ms >= 1000) return (ms / 1000).toFixed(1) + 's';
  return ms + 'ms';
}

// ─── Stats por instancia ──────────────────────────────────────────────────

function statsInstancia(env) {
  const slug = env.ASISTENTE_SLUG || 'unknown';
  const stats = {
    slug,
    nombre: env.ASISTENTE_NOMBRE || slug,
    pm2: null,
    db: null,
    eventos: { wa_in: 0, wa_out: 0, audios: 0, gmail_in: 0, gmail_out: 0,
                cal_creados: 0, cal_modificados: 0, cal_borrados: 0 },
    errores: { wa_disconnect: [], claude_fail: 0, fallaron: 0,
                invalid_grant: 0,
                deploys: 0, crashes: 0, sigint_timestamps: [],
                wa_reconexiones: 0, anomalias: [] },
    latencia: null,     // { total, contextos:[{ctx,n,p50,p95,max}], lentas30, lentas60 }
    programados: null,  // { pendientes, atrasados }
    seguridad: {
      // Cada item: { hhmm, jid, nombre, mensaje, is_owner } cuando aplica.
      security_audit: [],        // [security] o [audit] explícitos
      destinatario_bloqueado: [],// validación de destinatarios
      sandbox_fail: [],          // bwrap/sandbox failures
      rate_limit: [],            // rate limit / throttle
      tool_denegado: [],         // herramientas bloqueadas
      prompt_violation: [],      // prompt injection / jailbreak
      alerta_owner: [],          // alertas enviadas al owner
    },
    pendientes_por_usuario: [],
    eventos_proximos: [],
    notas: [],
  };

  // ── pm2 status ──
  try {
    const json = execSync('pm2 jlist', { encoding: 'utf8' });
    const procs = JSON.parse(json);
    const p = procs.find(pp => pp.name === slug);
    if (p) {
      const e = p.pm2_env || {};
      stats.pm2 = {
        pid: p.pid,
        status: e.status,
        uptime_ms: Date.now() - (e.pm_uptime || Date.now()),
        restart_time: e.restart_time,
        memory_mb: ((p.monit?.memory || 0) / 1024 / 1024).toFixed(1),
        cpu: p.monit?.cpu || 0,
      };
    }
  } catch (err) {
    stats.notas.push(`pm2 jlist falló: ${err.message}`);
  }

  // ── Logs pm2 últimas 24h: errores, restarts, disconnects, seguridad con contexto ──
  // Estrategia: 1ª pasada captura todos los eventos relevantes con timestamp;
  //             2ª pasada correlaciona SIGINT con boot siguiente (deploy vs crash)
  //             y eventos de seguridad con el [WA ←] previo (snippet + remitente).
  try {
    const logs = execSync(`pm2 logs ${slug} --lines 10000 --nostream 2>&1 | tail -10000`,
      { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
    const hace24h = Date.now() - 24 * 3600 * 1000;

    // line objects: { ts (ms), tsStr ('YYYY-MM-DD HH:MM:SS'), text (resto), raw }
    const events = [];
    for (const line of logs.split('\n')) {
      const m = line.match(/^\d+\|[\w-]+\s*\|\s*(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}):\s?(.*)$/);
      if (!m) continue;
      const ts = new Date(m[1].replace(' ', 'T') + '-03:00').getTime();
      if (ts < hace24h) continue;
      events.push({ ts, tsStr: m[1], text: m[2], raw: line });
    }

    const sigints = [];
    const boots = [];

    // ── Detección de anomalías sin clasificar ──
    // RE_PROBLEMA: línea con pinta de error. RE_CONOCIDO: ya la captura otro
    // clasificador (no la dupliques). RE_BENIGNO: menciona "error" sin serlo.
    const anomMap = new Map();
    const RE_PROBLEMA = /\b(error|exception|unhandled|rejection|ECONNRESET|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|ENOENT|EACCES|EPIPE|fatal|TypeError|ReferenceError|RangeError|SyntaxError)\b|cannot read|is not a function|is not defined|unhandledRejection/i;
    const RE_CONOCIDO = /\[WA disconnected\]|Claude falló|FALLARON|invalid_grant|SIGINT recibido|\[security\]|\[audit\]|destinatario.*(denegad|bloqueado|no.permitido|inv[aá]lido)|(bwrap|sandbox).*(fail|violation|error)|rate.?limit|throttle|too many|(tool|herramienta).*(denegad|bloqued|restring)|prompt.*(violation|injection)|jailbreak|\[WA alert\]|\[alerta\]|alert.*owner/i;
    const RE_BENIGNO = /sin error|0 error|no error|errores?:\s*(0|null|none)|error_code:\s*null/i;

    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      const line = ev.raw;
      const tsStr = ev.tsStr;
      const hhmm = tsStr.slice(11, 16);

      if (/\[WA disconnected\]/.test(line)) stats.errores.wa_disconnect.push(tsStr);
      if (/Claude falló/.test(line))         stats.errores.claude_fail++;
      if (/FALLARON/.test(line))             stats.errores.fallaron++;
      if (/invalid_grant/.test(line))        stats.errores.invalid_grant++;
      if (/SIGINT recibido/.test(line))      { sigints.push(ev); stats.errores.sigint_timestamps.push(tsStr); }
      if (/Maria \S+ \[[\w-]+\] iniciando|arrancando loop de recordatorios/.test(line)) boots.push(ev);

      // ── Buscar el último [WA ←] previo dentro de los últimos 8 eventos (~2 min) ──
      const ctx = () => {
        for (let j = i; j >= Math.max(0, i - 8); j--) {
          const m = events[j].text.match(/\[WA ←\]\s+([^(]+?)\s*\(([^)]+)\):\s*(.*)$/);
          if (m) return { nombre: m[1].trim(), jid: m[2].trim(), mensaje: m[3].slice(0, 120) };
        }
        return { nombre: '', jid: '', mensaje: '' };
      };

      const push = (arr, withCtx) => {
        const item = { hhmm };
        if (withCtx) Object.assign(item, ctx());
        arr.push(item);
      };

      if (/\[security\]|\[audit\]/i.test(line))                                       push(stats.seguridad.security_audit, false);
      if (/destinatario.*(denegad|bloqueado|no.permitido|inv[aá]lido)/i.test(line))   push(stats.seguridad.destinatario_bloqueado, true);
      if (/(bwrap|sandbox).*(fail|violation|error)/i.test(line))                       push(stats.seguridad.sandbox_fail, false);
      if (/rate.?limit|throttle|too many/i.test(line))                                push(stats.seguridad.rate_limit, true);
      if (/(tool|herramienta).*(denegad|bloqued|restring)/i.test(line))                push(stats.seguridad.tool_denegado, true);
      if (/prompt.*(violation|injection)|jailbreak/i.test(line))                       push(stats.seguridad.prompt_violation, true);
      if (/\[WA alert\]|\[alerta\]|alert.*owner/i.test(line))                          push(stats.seguridad.alerta_owner, false);

      // ── Reconexiones WA: cada ciclo arranca con un change_state OPENING ──
      if (/\[WA change_state\] OPENING/.test(line)) stats.errores.wa_reconexiones++;

      // ── Anomalías: pinta de error que ningún clasificador conocido agarró ──
      if (RE_PROBLEMA.test(line) && !RE_CONOCIDO.test(line) && !RE_BENIGNO.test(line)) {
        // Firma: el texto sin timestamps/ids/hex para agrupar repeticiones.
        const sig = ev.text.replace(/[0-9a-f]{6,}/gi, '·').replace(/\d+/g, '#').trim().slice(0, 160);
        const prev = anomMap.get(sig);
        if (prev) { prev.n++; prev.ultimoHhmm = hhmm; }
        else anomMap.set(sig, { n: 1, sample: ev.text.slice(0, 160), primerHhmm: hhmm, ultimoHhmm: hhmm });
      }
    }

    // Anomalías ordenadas por frecuencia (más repetidas primero).
    stats.errores.anomalias = [...anomMap.values()].sort((a, b) => b.n - a.n);

    // ── Correlación SIGINT → boot (≤60s) = deploy; sin boot = crash ──
    // Refinamiento: si el SIGINT es muy reciente (últimos 5 min) y pm2 está online,
    // asumimos que el boot está en curso (deploy) — evita falso positivo cuando
    // el reporte corre mientras un reload de cron-master termina.
    const nowMs = Date.now();
    const pm2Online = stats.pm2 && stats.pm2.status === 'online';
    for (const s of sigints) {
      const matched = boots.some(b => b.ts >= s.ts && b.ts - s.ts <= 60 * 1000);
      if (matched) {
        stats.errores.deploys++;
      } else if (pm2Online && (nowMs - s.ts) <= 5 * 60 * 1000) {
        // SIGINT muy reciente sin boot loggeado todavía, pm2 online → reload en curso
        stats.errores.deploys++;
      } else {
        stats.errores.crashes++;
      }
    }
  } catch (err) {
    stats.notas.push(`pm2 logs falló: ${err.message}`);
  }

  // ── DB stats (eventos últimas 24h, pendientes actuales) ──
  const dbPath = env.MARIA_DB;
  if (dbPath && fs.existsSync(dbPath)) {
    let db;
    try {
      db = new Database(dbPath, { readonly: true });
      stats.db = { path: dbPath, size_mb: (fs.statSync(dbPath).size / 1024 / 1024).toFixed(1) };

      // SQLite almacena timestamps con CURRENT_TIMESTAMP en formato
      // "YYYY-MM-DD HH:MM:SS" (espacio, sin T ni Z ni ms). Si comparamos contra
      // un ISO string crudo (.toISOString() → "...T...Z"), la comparación
      // lexicográfica falla: " " (32) < "T" (84) → eventos del mismo día con
      // hora >= la del cutoff quedan FUERA. Por eso normalizamos a formato
      // SQLite antes de comparar.
      const desde = new Date(Date.now() - 24 * 3600 * 1000)
        .toISOString().replace('T', ' ').slice(0, 19);

      const evs = db.prepare(`
        SELECT canal, direccion, tipo_original, COUNT(*) AS n
        FROM eventos
        WHERE timestamp >= ?
        GROUP BY canal, direccion, tipo_original
      `).all(desde);

      for (const r of evs) {
        if (r.canal === 'whatsapp') {
          if (r.direccion === 'entrante') stats.eventos.wa_in += r.n;
          if (r.direccion === 'saliente') stats.eventos.wa_out += r.n;
          if (r.tipo_original === 'ptt' || r.tipo_original === 'audio') stats.eventos.audios += r.n;
        }
        if (r.canal === 'gmail') {
          if (r.direccion === 'entrante') stats.eventos.gmail_in += r.n;
          if (r.direccion === 'saliente') stats.eventos.gmail_out += r.n;
        }
        if (r.canal === 'calendar' && r.direccion === 'saliente') {
          // El cuerpo dice "creado: ..." / "modificado: ..." / "borrado: ..."
          // Necesitamos detalle por verbo:
        }
      }

      const calVerbos = db.prepare(`
        SELECT cuerpo FROM eventos
        WHERE canal='calendar' AND direccion='saliente' AND timestamp >= ?
      `).all(desde);
      for (const r of calVerbos) {
        if (/^creado:/i.test(r.cuerpo))      stats.eventos.cal_creados++;
        if (/^modificado:/i.test(r.cuerpo))  stats.eventos.cal_modificados++;
        if (/^borrado:/i.test(r.cuerpo))     stats.eventos.cal_borrados++;
      }

      // ── Latencia de claude_call (24h) ──
      // Los eventos se loguean como canal='sistema' con cuerpo
      // "claude_call <contexto>: <N>ms ...". GLOB trata el "_" literal.
      const ccRows = db.prepare(`
        SELECT cuerpo FROM eventos
        WHERE canal='sistema' AND cuerpo GLOB 'claude_call*' AND timestamp >= ?
      `).all(desde);
      const _porCtx = {};
      let lentas30 = 0, lentas60 = 0;
      for (const r of ccRows) {
        const m = String(r.cuerpo).match(/^claude_call\s+(\S+):\s*(\d+)\s*ms/);
        if (!m) continue;
        const ms = parseInt(m[2], 10);
        (_porCtx[m[1]] || (_porCtx[m[1]] = [])).push(ms);
        if (ms > 30000) lentas30++;
        if (ms > 60000) lentas60++;
      }
      const _pct = (arr, q) => {
        if (!arr.length) return 0;
        const s = [...arr].sort((a, b) => a - b);
        return s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))];
      };
      const _contextos = Object.keys(_porCtx).map(ctx => {
        const a = _porCtx[ctx];
        return { ctx, n: a.length, p50: _pct(a, 0.5), p95: _pct(a, 0.95), max: Math.max(...a) };
      }).sort((x, y) => y.n - x.n);
      stats.latencia = {
        total: _contextos.reduce((s, c) => s + c.n, 0),
        contextos: _contextos, lentas30, lentas60,
      };

      // ── Cola de programados (enviado=0; -1 = cancelado, no cuenta) ──
      // `cuando` se guarda siempre con .toISOString() → comparable lexicográfico
      // contra otro ISO. "atrasado" = vencido y todavía sin despachar.
      const _nowIso = new Date().toISOString();
      const _prog = db.prepare(`
        SELECT COUNT(*) AS pendientes,
               COALESCE(SUM(CASE WHEN cuando <= ? THEN 1 ELSE 0 END), 0) AS atrasados
        FROM programados WHERE enviado = 0
      `).get(_nowIso);
      stats.programados = { pendientes: _prog.pendientes || 0, atrasados: _prog.atrasados || 0 };

      const usuarios = db.prepare(`SELECT id, nombre, rol FROM usuarios WHERE activo=1 ORDER BY rol DESC, id`).all();
      for (const u of usuarios) {
        const abiertos = db.prepare(`SELECT COUNT(*) AS n FROM pendientes WHERE usuario_id=? AND estado='abierto'`).get(u.id).n;
        const nuevosHoy = db.prepare(`SELECT COUNT(*) AS n FROM pendientes WHERE usuario_id=? AND creado >= ?`).get(u.id, desde).n;
        const cerradosHoy = db.prepare(`SELECT COUNT(*) AS n FROM pendientes WHERE usuario_id=? AND cerrado >= ?`).get(u.id, desde).n;
        stats.pendientes_por_usuario.push({ nombre: u.nombre, rol: u.rol, abiertos, nuevosHoy, cerradosHoy });
      }

      // ── Enriquecer eventos de seguridad con flag is_owner ──
      // Heurística: matchear por nombre (cómo Maria lo identifica en logs `[WA ←] Nombre (jid):`).
      const ownerNombres = new Set(usuarios.filter(u => u.rol === 'owner').map(u => u.nombre));
      for (const key of Object.keys(stats.seguridad)) {
        for (const item of stats.seguridad[key]) {
          if (item && item.nombre && ownerNombres.has(item.nombre)) item.is_owner = true;
        }
      }
    } catch (err) {
      stats.notas.push(`DB falló: ${err.message}`);
    } finally {
      if (db) db.close();
    }
  } else {
    stats.notas.push(`MARIA_DB no encontrado: ${dbPath}`);
  }

  return stats;
}

// ─── Render texto plano (fallback) ────────────────────────────────────────

function renderTexto(allStats, fechaStr) {
  const lines = [];
  lines.push(`📊 Reporte diario VPS Maria — ${fechaStr}`);
  lines.push('');
  lines.push(`Instancias activas: ${allStats.length}`);
  lines.push('');
  for (const s of allStats) {
    lines.push('═══════════════════════════════════════════');
    lines.push(`INSTANCIA: ${s.slug} (${s.nombre})`);
    lines.push('═══════════════════════════════════════════');
    const e = s.errores;
    if (s.pm2) {
      lines.push(`pm2: ${s.pm2.status} · pid ${s.pm2.pid} · uptime ${fmtUptime(s.pm2.uptime_ms)} · ${s.pm2.memory_mb} MB · ${s.pm2.cpu}% CPU`);
      lines.push(`Proceso: ${e.deploys} deploys · ${e.crashes} crashes (restarts lifetime: ${s.pm2.restart_time})`);
    }
    lines.push(`WhatsApp: ${s.eventos.wa_in}↓ / ${s.eventos.wa_out}↑ (${s.eventos.audios} audios)`);
    lines.push(`Gmail:    ${s.eventos.gmail_in}↓ / ${s.eventos.gmail_out}↑`);
    lines.push(`Calendar: ${s.eventos.cal_creados} creados · ${s.eventos.cal_modificados} modificados · ${s.eventos.cal_borrados} borrados`);
    if (e.wa_disconnect.length) lines.push(`⚠️ WA disconnect x${e.wa_disconnect.length}`);
    if (e.claude_fail)          lines.push(`⚠️ Claude falló: ${e.claude_fail}`);
    if (e.fallaron)             lines.push(`⚠️ Acciones parciales: ${e.fallaron}`);
    if (e.invalid_grant)        lines.push(`⚠️ Google invalid_grant: ${e.invalid_grant}`);
    if (e.crashes > 0)          lines.push(`🔴 Crashes (SIGINT sin recovery): ${e.crashes}`);

    // ── Rendimiento: latencia Claude + cola de programados ──
    if (s.latencia && s.latencia.total) {
      lines.push(`Latencia Claude 24h (${s.latencia.total} llamadas):`);
      for (const c of s.latencia.contextos) {
        lines.push(`   · ${c.ctx}: p50 ${fmtMs(c.p50)} · p95 ${fmtMs(c.p95)} · máx ${fmtMs(c.max)}  (${c.n})`);
      }
      if (s.latencia.lentas30) {
        lines.push(`   ${s.latencia.lentas60 ? '🔴' : '⚠️'} ${s.latencia.lentas30} llamada(s) >30s · ${s.latencia.lentas60} >60s`);
      }
    }
    if (s.programados) {
      let pl = `Programados en cola: ${s.programados.pendientes}`;
      if (s.programados.atrasados) pl += `  🔴 ${s.programados.atrasados} ATRASADOS`;
      lines.push(pl);
    }
    if (e.wa_reconexiones) lines.push(`WA reconexiones (change_state): ${e.wa_reconexiones}`);

    // ── Anomalías sin clasificar ──
    if (e.anomalias && e.anomalias.length) {
      lines.push(`⚠️ Anomalías sin clasificar: ${e.anomalias.length}`);
      for (const a of e.anomalias.slice(0, 5)) {
        lines.push(`   ×${a.n}  ${a.primerHhmm}  ${a.sample.slice(0, 90)}`);
      }
      if (e.anomalias.length > 5) lines.push(`   …+${e.anomalias.length - 5} más`);
    }

    // ── Seguridad (sólo se imprime si hay matches) ──
    const seg = s.seguridad || {};
    const segItems = [
      ['Audit/security explícito',      seg.security_audit],
      ['Destinatario bloqueado',        seg.destinatario_bloqueado],
      ['Sandbox/bwrap fail',            seg.sandbox_fail],
      ['Rate-limit',                    seg.rate_limit],
      ['Tool denegada',                 seg.tool_denegado],
      ['Prompt violation/injection',    seg.prompt_violation],
      ['Alerta al owner',               seg.alerta_owner],
    ].filter(([_, arr]) => arr && arr.length);
    if (segItems.length) {
      lines.push('🔐 Seguridad:');
      for (const [label, arr] of segItems) {
        lines.push(`   · ${label} ×${arr.length}`);
        for (const it of arr.slice(-3)) {
          const quien = it.nombre ? `${it.nombre}${it.is_owner ? ' (owner)' : ''}` : '';
          const msg = it.mensaje ? `: "${it.mensaje.slice(0, 80)}${it.mensaje.length > 80 ? '…' : ''}"` : '';
          lines.push(`       ${it.hhmm}${quien ? `  ${quien}` : ''}${msg}`);
        }
      }
    }

    for (const p of s.pendientes_por_usuario) {
      const tag = p.rol === 'owner' ? ' [owner]' : '';
      lines.push(`  ${p.nombre}${tag}: ${p.abiertos} abiertos (+${p.nuevosHoy} -${p.cerradosHoy})`);
    }
    lines.push('');
  }
  lines.push('—');
  lines.push('Reporte automático generado por daily-report.js');
  return lines.join('\n');
}

// ─── Render HTML (con colores y barras) ───────────────────────────────────

function _esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _bar(value, max, color) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return `<div style="background:#eef2f7;border-radius:4px;height:14px;width:160px;display:inline-block;vertical-align:middle;overflow:hidden;">
    <div style="background:${color};width:${pct}%;height:100%;"></div>
  </div>`;
}

function _badge(text, color) {
  return `<span style="display:inline-block;padding:2px 8px;border-radius:10px;background:${color};color:#fff;font-size:11px;font-weight:600;letter-spacing:0.3px;text-transform:uppercase;">${_esc(text)}</span>`;
}

function _evaluarSalud(s) {
  const e = s.errores;
  if (!s.pm2 || s.pm2.status !== 'online') return { color: '#dc2626', label: 'CAÍDO' };
  if (e.invalid_grant > 0)                   return { color: '#dc2626', label: 'OAuth roto' };
  if (e.crashes > 0)                         return { color: '#dc2626', label: 'CRASHES' };
  if (e.wa_disconnect.length > 0)            return { color: '#f59e0b', label: 'Atención' };
  if (e.claude_fail > 0 || e.fallaron > 0)   return { color: '#f59e0b', label: 'Atención' };
  if (s.programados && s.programados.atrasados > 0) return { color: '#f59e0b', label: 'Cola atascada' };
  if (e.anomalias && e.anomalias.length > 0)        return { color: '#f59e0b', label: 'Atención' };
  // Deploys (incluso muchos) no afectan salud — son operación normal.
  // La latencia de Claude se informa pero NO mueve el badge (thinking largo conocido).
  return { color: '#10b981', label: 'OK' };
}

function renderHTML(allStats, fechaStr) {
  const html = [];
  html.push(`<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937;">
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f4f6fa;padding:24px 16px;">
<tr><td align="center">
<table cellpadding="0" cellspacing="0" border="0" width="640" style="max-width:640px;width:100%;">

<!-- Header -->
<tr><td style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:24px;border-radius:12px 12px 0 0;color:#fff;">
  <div style="font-size:13px;opacity:0.85;text-transform:uppercase;letter-spacing:1px;">Reporte diario</div>
  <div style="font-size:26px;font-weight:700;margin-top:4px;">📊 VPS Maria</div>
  <div style="font-size:14px;opacity:0.9;margin-top:6px;">${_esc(fechaStr)} · ${allStats.length} instancia${allStats.length === 1 ? '' : 's'}</div>
</td></tr>`);

  for (const s of allStats) {
    const salud = _evaluarSalud(s);
    const e = s.errores;
    const totalTraf = s.eventos.wa_in + s.eventos.wa_out;
    const maxTraf = Math.max(totalTraf, s.eventos.gmail_in + s.eventos.gmail_out, s.eventos.cal_creados + s.eventos.cal_modificados + s.eventos.cal_borrados, 10);

    html.push(`<tr><td style="background:#fff;padding:0;">
<table cellpadding="0" cellspacing="0" border="0" width="100%">
<!-- Instance header -->
<tr><td style="padding:20px 24px 12px;border-bottom:1px solid #f1f5f9;">
  <table cellpadding="0" cellspacing="0" border="0" width="100%">
    <tr>
      <td><div style="font-size:18px;font-weight:700;color:#1f2937;">${_esc(s.nombre)}</div>
          <div style="font-size:12px;color:#64748b;font-family:Menlo,monospace;">${_esc(s.slug)}</div></td>
      <td align="right">${_badge(salud.label, salud.color)}</td>
    </tr>
  </table>
</td></tr>

<!-- pm2 stats -->
<tr><td style="padding:16px 24px;">
  <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;font-weight:600;margin-bottom:8px;">Proceso</div>
  ${s.pm2 ? `
  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="font-size:13px;color:#1f2937;">
    <tr>
      <td style="padding:4px 0;"><strong>${_esc(s.pm2.status)}</strong> · pid <code style="background:#f1f5f9;padding:1px 6px;border-radius:3px;font-size:12px;">${s.pm2.pid}</code></td>
      <td align="right" style="padding:4px 0;">uptime <strong>${fmtUptime(s.pm2.uptime_ms)}</strong></td>
    </tr>
    <tr>
      <td style="padding:4px 0;color:#64748b;">deploys 24h: <strong style="color:#1f2937;">${e.deploys}</strong> · crashes 24h: <strong style="color:${e.crashes > 0 ? '#dc2626' : '#16a34a'};">${e.crashes}</strong> <span style="color:#94a3b8;font-size:11px;">(lifetime: ${s.pm2.restart_time})</span></td>
      <td align="right" style="padding:4px 0;color:#64748b;">${s.pm2.memory_mb} MB · ${s.pm2.cpu}% CPU</td>
    </tr>
  </table>
  ` : `<div style="color:#dc2626;">⚠️ no encontrado en pm2 list</div>`}
</td></tr>

<!-- Actividad -->
<tr><td style="padding:16px 24px;border-top:1px solid #f1f5f9;">
  <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;font-weight:600;margin-bottom:12px;">Actividad últimas 24h</div>
  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="font-size:13px;">
    <tr><td style="padding:6px 0;width:90px;"><span style="color:#16a34a;">●</span> WhatsApp</td>
        <td style="padding:6px 8px;">${_bar(totalTraf, maxTraf, '#16a34a')}</td>
        <td align="right" style="padding:6px 0;color:#1f2937;font-variant-numeric:tabular-nums;"><strong>${s.eventos.wa_in}</strong>↓ / <strong>${s.eventos.wa_out}</strong>↑ ${s.eventos.audios > 0 ? `<span style="color:#64748b;font-size:12px;">· ${s.eventos.audios} 🎤</span>` : ''}</td></tr>
    <tr><td style="padding:6px 0;"><span style="color:#2563eb;">●</span> Gmail</td>
        <td style="padding:6px 8px;">${_bar(s.eventos.gmail_in + s.eventos.gmail_out, maxTraf, '#2563eb')}</td>
        <td align="right" style="padding:6px 0;font-variant-numeric:tabular-nums;"><strong>${s.eventos.gmail_in}</strong>↓ / <strong>${s.eventos.gmail_out}</strong>↑</td></tr>
    <tr><td style="padding:6px 0;"><span style="color:#7c3aed;">●</span> Calendar</td>
        <td style="padding:6px 8px;">${_bar(s.eventos.cal_creados + s.eventos.cal_modificados + s.eventos.cal_borrados, maxTraf, '#7c3aed')}</td>
        <td align="right" style="padding:6px 0;font-variant-numeric:tabular-nums;"><strong>${s.eventos.cal_creados}</strong>+ <strong>${s.eventos.cal_modificados}</strong>✏ <strong>${s.eventos.cal_borrados}</strong>🗑</td></tr>
  </table>
</td></tr>

<!-- Errores -->
<tr><td style="padding:16px 24px;border-top:1px solid #f1f5f9;">
  <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;font-weight:600;margin-bottom:8px;">Errores y anomalías</div>`);

    const erroresHtml = [];
    if (e.wa_disconnect.length) erroresHtml.push(`<div style="padding:6px 10px;background:#fef3c7;border-left:3px solid #f59e0b;border-radius:3px;margin-bottom:6px;font-size:13px;">⚠️ WA disconnect <strong>×${e.wa_disconnect.length}</strong> ${e.wa_disconnect.slice(-3).map(t => `<code style="background:#fde68a;padding:1px 4px;border-radius:2px;font-size:11px;">${_esc(t.slice(11,16))}</code>`).join(' ')}${e.wa_disconnect.length > 3 ? ' …' : ''}</div>`);
    if (e.claude_fail) erroresHtml.push(`<div style="padding:6px 10px;background:#fef3c7;border-left:3px solid #f59e0b;border-radius:3px;margin-bottom:6px;font-size:13px;">⚠️ Claude falló: <strong>${e.claude_fail}</strong> ocurrencias</div>`);
    if (e.fallaron) erroresHtml.push(`<div style="padding:6px 10px;background:#fef3c7;border-left:3px solid #f59e0b;border-radius:3px;margin-bottom:6px;font-size:13px;">⚠️ Acciones parciales: <strong>${e.fallaron}</strong></div>`);
    if (e.invalid_grant) erroresHtml.push(`<div style="padding:6px 10px;background:#fee2e2;border-left:3px solid #dc2626;border-radius:3px;margin-bottom:6px;font-size:13px;color:#991b1b;">🔴 Google invalid_grant ×${e.invalid_grant} — <strong>reauth necesario</strong></div>`);
    if (e.crashes > 0) erroresHtml.push(`<div style="padding:6px 10px;background:#fee2e2;border-left:3px solid #dc2626;border-radius:3px;margin-bottom:6px;font-size:13px;color:#991b1b;">🔴 Crashes <strong>×${e.crashes}</strong> (SIGINT sin reinicio dentro de 60s)</div>`);
    if (e.anomalias && e.anomalias.length) {
      for (const a of e.anomalias.slice(0, 6)) {
        erroresHtml.push(`<div style="padding:6px 10px;background:#fef3c7;border-left:3px solid #f59e0b;border-radius:3px;margin-bottom:6px;font-size:13px;">⚠️ <strong>×${a.n}</strong> <code style="background:#fde68a;padding:1px 4px;border-radius:2px;font-size:11px;">${_esc(a.primerHhmm)}</code> ${_esc(a.sample.slice(0, 120))}${a.sample.length > 120 ? '…' : ''}</div>`);
      }
      if (e.anomalias.length > 6) erroresHtml.push(`<div style="font-size:11px;color:#64748b;margin-bottom:6px;">…+${e.anomalias.length - 6} anomalía(s) más sin clasificar</div>`);
    }
    if (!erroresHtml.length) erroresHtml.push(`<div style="padding:8px 10px;background:#f0fdf4;border-left:3px solid #10b981;border-radius:3px;font-size:13px;color:#065f46;">✓ sin errores destacados${e.deploys > 0 ? ` · ${e.deploys} deploy${e.deploys === 1 ? '' : 's'} normal${e.deploys === 1 ? '' : 'es'} en 24h` : ''}</div>`);
    html.push(erroresHtml.join(''));
    html.push(`</td></tr>`);

    // ── Rendimiento: latencia Claude + cola de programados + reconexiones WA ──
    {
      const L = s.latencia;
      const P = s.programados;
      const filasLat = (L && L.contextos.length)
        ? L.contextos.map(c => `<tr style="border-top:1px solid #f8fafc;">
      <td style="padding:6px 0;font-size:13px;">${_esc(c.ctx)} <span style="color:#94a3b8;font-size:11px;">×${c.n}</span></td>
      <td align="right" style="padding:6px 0;font-size:13px;font-variant-numeric:tabular-nums;color:#64748b;">p50 <strong style="color:#1f2937;">${fmtMs(c.p50)}</strong> · p95 <strong style="color:#1f2937;">${fmtMs(c.p95)}</strong> · máx <strong style="color:${c.max > 60000 ? '#dc2626' : c.max > 30000 ? '#d97706' : '#1f2937'};">${fmtMs(c.max)}</strong></td>
    </tr>`).join('')
        : `<tr><td style="padding:6px 0;font-size:13px;color:#94a3b8;">sin llamadas claude_call registradas en 24h</td></tr>`;
      const slowNote = (L && L.lentas30)
        ? `<div style="margin-top:8px;padding:5px 10px;background:${L.lentas60 ? '#fee2e2' : '#fef3c7'};border-left:3px solid ${L.lentas60 ? '#dc2626' : '#f59e0b'};border-radius:3px;font-size:12px;">${L.lentas60 ? '🔴' : '⚠️'} ${L.lentas30} llamada${L.lentas30 === 1 ? '' : 's'} &gt;30s · ${L.lentas60} &gt;60s</div>`
        : '';
      const progLine = P
        ? `<div style="margin-top:10px;font-size:13px;color:#1f2937;">Programados en cola: <strong>${P.pendientes}</strong>${P.atrasados ? ` <span style="background:#fee2e2;color:#991b1b;padding:1px 7px;border-radius:8px;font-size:11px;font-weight:600;margin-left:4px;">🔴 ${P.atrasados} atrasado${P.atrasados === 1 ? '' : 's'}</span>` : ` <span style="color:#94a3b8;font-size:12px;">· al día</span>`}</div>`
        : '';
      const reconLine = e.wa_reconexiones
        ? `<div style="margin-top:6px;font-size:12px;color:#64748b;">🔄 Reconexiones WA (change_state): <strong style="color:#1f2937;">${e.wa_reconexiones}</strong></div>`
        : '';
      html.push(`<tr><td style="padding:16px 24px;border-top:1px solid #f1f5f9;">
  <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;font-weight:600;margin-bottom:8px;">Rendimiento — latencia Claude (24h)</div>
  <table cellpadding="0" cellspacing="0" border="0" width="100%">${filasLat}</table>
  ${slowNote}${progLine}${reconLine}
</td></tr>`);
    }

    // ── Seguridad (sólo si hay matches en pm2 logs) ──
    const seg = s.seguridad || {};
    const segItems = [
      ['Audit/security explícito',   seg.security_audit,         '#6366f1'],
      ['Destinatario bloqueado',     seg.destinatario_bloqueado, '#dc2626'],
      ['Sandbox/bwrap fail',         seg.sandbox_fail,           '#dc2626'],
      ['Rate-limit',                 seg.rate_limit,             '#f59e0b'],
      ['Tool denegada',              seg.tool_denegado,          '#f59e0b'],
      ['Prompt violation/injection', seg.prompt_violation,       '#dc2626'],
      ['Alerta al owner',            seg.alerta_owner,           '#6366f1'],
    ].filter(([_, arr]) => arr && arr.length);
    if (segItems.length) {
      html.push(`<tr><td style="padding:16px 24px;border-top:1px solid #f1f5f9;">
  <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;font-weight:600;margin-bottom:8px;">🔐 Seguridad — eventos en logs</div>`);
      for (const [label, arr, color] of segItems) {
        // Item summary line
        html.push(`<div style="padding:8px 10px;background:#fafbfc;border-left:3px solid ${color};border-radius:3px;margin-bottom:6px;font-size:13px;">
          <div style="margin-bottom:${arr.some(it => it.nombre || it.mensaje) ? '6px' : '0'};"><strong>🔐 ${_esc(label)} ×${arr.length}</strong></div>`);
        // Detail rows con timestamp, quién, snippet
        for (const it of arr.slice(-3)) {
          const ownerBadge = it.is_owner
            ? `<span style="display:inline-block;background:#ddd6fe;color:#5b21b6;padding:1px 6px;border-radius:8px;font-size:10px;font-weight:600;letter-spacing:0.3px;margin-left:4px;">OWNER</span>`
            : (it.nombre ? `<span style="display:inline-block;background:#fee2e2;color:#991b1b;padding:1px 6px;border-radius:8px;font-size:10px;font-weight:600;letter-spacing:0.3px;margin-left:4px;">3RO</span>` : '');
          const quien = it.nombre ? `<strong>${_esc(it.nombre)}</strong>${ownerBadge}` : '';
          const msg = it.mensaje ? `<div style="margin-top:2px;color:#475569;font-style:italic;font-size:12px;">"${_esc(it.mensaje.slice(0, 120))}${it.mensaje.length > 120 ? '…' : ''}"</div>` : '';
          if (quien || msg) {
            html.push(`<div style="padding:4px 8px;background:#fff;border-radius:3px;margin-top:4px;font-size:12px;color:#1f2937;">
              <code style="background:#f1f5f9;padding:1px 4px;border-radius:2px;font-size:11px;margin-right:6px;">${_esc(it.hhmm)}</code> ${quien}${msg}
            </div>`);
          }
        }
        if (arr.length > 3) html.push(`<div style="margin-top:4px;font-size:11px;color:#64748b;">…+${arr.length - 3} más</div>`);
        html.push(`</div>`);
      }
      html.push(`</td></tr>`);
    }

    // Pendientes
    if (s.pendientes_por_usuario.length) {
      html.push(`<tr><td style="padding:16px 24px;border-top:1px solid #f1f5f9;">
  <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;font-weight:600;margin-bottom:10px;">Pendientes por usuario</div>
  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="font-size:13px;">
    <tr style="color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:0.4px;">
      <td style="padding:4px 0;">Usuario</td>
      <td align="right" style="padding:4px 12px;">Abiertos</td>
      <td align="right" style="padding:4px 0;">Hoy</td>
    </tr>`);
      for (const p of s.pendientes_por_usuario) {
        const tag = p.rol === 'owner' ? ' <span style="background:#ddd6fe;color:#5b21b6;padding:1px 6px;border-radius:8px;font-size:10px;font-weight:600;letter-spacing:0.3px;">OWNER</span>' : '';
        const mvto = p.nuevosHoy || p.cerradosHoy
          ? `<span style="color:#64748b;font-size:12px;">${p.nuevosHoy ? `<span style="color:#dc2626;">+${p.nuevosHoy}</span>` : ''} ${p.cerradosHoy ? `<span style="color:#16a34a;">−${p.cerradosHoy}</span>` : ''}</span>`
          : `<span style="color:#cbd5e1;">·</span>`;
        html.push(`<tr style="border-top:1px solid #f8fafc;">
      <td style="padding:8px 0;">${_esc(p.nombre)}${tag}</td>
      <td align="right" style="padding:8px 12px;font-variant-numeric:tabular-nums;font-weight:600;">${p.abiertos}</td>
      <td align="right" style="padding:8px 0;">${mvto}</td>
    </tr>`);
      }
      html.push(`</table></td></tr>`);
    }

    if (s.notas.length) {
      html.push(`<tr><td style="padding:12px 24px;border-top:1px solid #f1f5f9;background:#fafbfc;">
  <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;font-weight:600;margin-bottom:6px;">Notas</div>`);
      for (const n of s.notas) html.push(`<div style="font-size:12px;color:#475569;padding:2px 0;">· ${_esc(n)}</div>`);
      html.push(`</td></tr>`);
    }

    html.push(`</table></td></tr>`);
  }

  html.push(`<!-- Footer -->
<tr><td style="padding:20px 24px;background:#1f2937;color:#94a3b8;border-radius:0 0 12px 12px;font-size:12px;">
  <div style="opacity:0.8;">Reporte automático · daily-report.js · 06:00 ART</div>
</td></tr>

</table>
</td></tr>
</table>
</body></html>`);

  return html.join('\n');
}

// Wrapper que devuelve {texto, html}
function renderReporte(allStats, fechaStr) {
  return {
    texto: renderTexto(allStats, fechaStr),
    html:  renderHTML(allStats, fechaStr),
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  const confs = listarConfs();
  if (!confs.length) {
    console.error('No hay .conf de instancias en config/instances/');
    process.exit(1);
  }

  const allStats = [];
  for (const cf of confs) {
    const env = parseConf(cf);
    console.log(`Stats para ${env.ASISTENTE_SLUG || cf}...`);
    allStats.push(statsInstancia(env));
  }

  const fecha = new Date();
  const fechaStr = fecha.toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', year: 'numeric' });
  const { texto, html } = renderReporte(allStats, fechaStr);

  console.log('\n────── PREVIEW (texto) ──────');
  console.log(texto);
  console.log('────── HTML LENGTH ──────', html.length, 'bytes\n');

  if (DRY_RUN) {
    console.log('DRY_RUN=1 — no mando email');
    return;
  }

  // Cargar env de la primera instancia (la "admin") para google.js
  const adminEnv = parseConf(confs[0]);
  for (const k of Object.keys(adminEnv)) {
    if (!process.env[k]) process.env[k] = adminEnv[k];
  }
  const g = require('./google');
  const destino = adminEnv.OWNER_EMAIL || process.env.OWNER_EMAIL;
  if (!destino) {
    console.error('No hay OWNER_EMAIL en el primer .conf — no sé a quién mandar el reporte');
    process.exit(1);
  }
  await g.enviarEmail({
    to: destino,
    asunto: `📊 Reporte diario VPS Maria — ${fechaStr}`,
    texto,
    html,
  });
  console.log(`✓ enviado a ${destino}`);
}

main().catch(err => {
  console.error('daily-report falló:', err);
  process.exit(1);
});
