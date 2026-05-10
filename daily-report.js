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
                invalid_grant: 0, sigint: 0 },
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

  // ── Logs pm2 últimas 24h: errores, restarts, disconnects ──
  try {
    const logs = execSync(`pm2 logs ${slug} --lines 10000 --nostream 2>&1 | tail -10000`,
      { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
    const hace24h = Date.now() - 24 * 3600 * 1000;
    for (const line of logs.split('\n')) {
      const tsMatch = line.match(/^\d+\|[\w-]+\s*\|\s*(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/);
      if (!tsMatch) continue;
      const ts = new Date(tsMatch[1].replace(' ', 'T') + '-03:00').getTime();
      if (ts < hace24h) continue;

      if (/\[WA disconnected\]/.test(line)) stats.errores.wa_disconnect.push(tsMatch[1]);
      if (/Claude falló/.test(line))         stats.errores.claude_fail++;
      if (/FALLARON/.test(line))             stats.errores.fallaron++;
      if (/invalid_grant/.test(line))        stats.errores.invalid_grant++;
      if (/SIGINT recibido/.test(line))      stats.errores.sigint++;
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

      const desde = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

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

      const usuarios = db.prepare(`SELECT id, nombre, rol FROM usuarios WHERE activo=1 ORDER BY rol DESC, id`).all();
      for (const u of usuarios) {
        const abiertos = db.prepare(`SELECT COUNT(*) AS n FROM pendientes WHERE usuario_id=? AND estado='abierto'`).get(u.id).n;
        const nuevosHoy = db.prepare(`SELECT COUNT(*) AS n FROM pendientes WHERE usuario_id=? AND creado >= ?`).get(u.id, desde).n;
        const cerradosHoy = db.prepare(`SELECT COUNT(*) AS n FROM pendientes WHERE usuario_id=? AND cerrado >= ?`).get(u.id, desde).n;
        stats.pendientes_por_usuario.push({ nombre: u.nombre, rol: u.rol, abiertos, nuevosHoy, cerradosHoy });
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

// ─── Render del email ─────────────────────────────────────────────────────

function renderReporte(allStats, fechaStr) {
  const lines = [];
  lines.push(`📊 Reporte diario VPS Maria — ${fechaStr}`);
  lines.push('');
  lines.push(`Instancias activas: ${allStats.length}`);
  lines.push('');

  for (const s of allStats) {
    lines.push('═══════════════════════════════════════════');
    lines.push(`INSTANCIA: ${s.slug} (${s.nombre})`);
    lines.push('═══════════════════════════════════════════');
    lines.push('');

    if (s.pm2) {
      lines.push(`Proceso pm2:`);
      lines.push(`  status: ${s.pm2.status} · pid: ${s.pm2.pid} · uptime: ${fmtUptime(s.pm2.uptime_ms)} · restarts (total): ${s.pm2.restart_time} · memoria: ${s.pm2.memory_mb} MB · cpu: ${s.pm2.cpu}%`);
    } else {
      lines.push(`Proceso pm2: ⚠️ no encontrado`);
    }
    lines.push('');

    lines.push(`Volumen últimas 24h:`);
    lines.push(`  WhatsApp:  ${s.eventos.wa_in} entrantes / ${s.eventos.wa_out} salientes (incluye ${s.eventos.audios} audios)`);
    lines.push(`  Gmail:     ${s.eventos.gmail_in} entrantes / ${s.eventos.gmail_out} salientes`);
    lines.push(`  Calendar:  ${s.eventos.cal_creados} creados · ${s.eventos.cal_modificados} modificados · ${s.eventos.cal_borrados} borrados`);
    lines.push('');

    const e = s.errores;
    const hayErrores = e.wa_disconnect.length || e.claude_fail || e.fallaron || e.invalid_grant;
    lines.push(`Errores y anomalías:`);
    if (e.wa_disconnect.length) lines.push(`  ⚠️ WA disconnected x ${e.wa_disconnect.length} (${e.wa_disconnect.slice(-3).map(t => t.slice(11,16)).join(', ')}${e.wa_disconnect.length > 3 ? ', ...' : ''})`);
    if (e.claude_fail)          lines.push(`  ⚠️ Claude falló:    ${e.claude_fail} ocurrencias`);
    if (e.fallaron)             lines.push(`  ⚠️ Acciones fallaron parcial: ${e.fallaron}`);
    if (e.invalid_grant)        lines.push(`  ⚠️ Google invalid_grant: ${e.invalid_grant} (token expirado, reauth necesario)`);
    if (e.sigint > 4)           lines.push(`  ⚠️ SIGINT recibidos: ${e.sigint} (más de 4/día = posible loop de crash)`);
    if (!hayErrores)            lines.push(`  ✓ sin errores destacados`);
    lines.push('');

    lines.push(`Pendientes:`);
    if (s.pendientes_por_usuario.length === 0) {
      lines.push('  (sin usuarios)');
    } else {
      for (const p of s.pendientes_por_usuario) {
        const tag = p.rol === 'owner' ? ' [owner]' : '';
        lines.push(`  ${pad(p.nombre + tag, 30)} ${p.abiertos} abiertos (+${p.nuevosHoy} nuevos, -${p.cerradosHoy} cerrados hoy)`);
      }
    }
    lines.push('');

    if (s.notas.length) {
      lines.push(`Notas:`);
      for (const n of s.notas) lines.push(`  · ${n}`);
      lines.push('');
    }
  }

  lines.push('—');
  lines.push('Reporte automático generado por daily-report.js');
  return lines.join('\n');
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
  const cuerpo = renderReporte(allStats, fechaStr);

  console.log('\n────── PREVIEW ──────');
  console.log(cuerpo);
  console.log('────── END ──────\n');

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
    texto: cuerpo,
  });
  console.log(`✓ enviado a ${destino}`);
}

main().catch(err => {
  console.error('daily-report falló:', err);
  process.exit(1);
});
