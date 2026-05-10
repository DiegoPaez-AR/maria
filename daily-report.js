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
    if (s.pm2) {
      lines.push(`pm2: ${s.pm2.status} · pid ${s.pm2.pid} · uptime ${fmtUptime(s.pm2.uptime_ms)} · restarts ${s.pm2.restart_time} · ${s.pm2.memory_mb} MB · ${s.pm2.cpu}% CPU`);
    }
    lines.push(`WhatsApp: ${s.eventos.wa_in}↓ / ${s.eventos.wa_out}↑ (${s.eventos.audios} audios)`);
    lines.push(`Gmail:    ${s.eventos.gmail_in}↓ / ${s.eventos.gmail_out}↑`);
    lines.push(`Calendar: ${s.eventos.cal_creados} creados · ${s.eventos.cal_modificados} modificados · ${s.eventos.cal_borrados} borrados`);
    const e = s.errores;
    if (e.wa_disconnect.length) lines.push(`⚠️ WA disconnect x${e.wa_disconnect.length}`);
    if (e.claude_fail)          lines.push(`⚠️ Claude falló: ${e.claude_fail}`);
    if (e.fallaron)             lines.push(`⚠️ Acciones parciales: ${e.fallaron}`);
    if (e.invalid_grant)        lines.push(`⚠️ Google invalid_grant: ${e.invalid_grant}`);
    if (e.sigint > 4)           lines.push(`⚠️ SIGINT: ${e.sigint}`);
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
  if (e.wa_disconnect.length > 0 || e.sigint > 4) return { color: '#f59e0b', label: 'Atención' };
  if (e.claude_fail > 0 || e.fallaron > 0)   return { color: '#f59e0b', label: 'Atención' };
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
      <td style="padding:4px 0;color:#64748b;">restarts: <strong style="color:${s.pm2.restart_time > 4 ? '#f59e0b' : '#1f2937'};">${s.pm2.restart_time}</strong></td>
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
    if (e.sigint > 4) erroresHtml.push(`<div style="padding:6px 10px;background:#fef3c7;border-left:3px solid #f59e0b;border-radius:3px;margin-bottom:6px;font-size:13px;">⚠️ SIGINT × ${e.sigint} (más de 4/día = posible loop)</div>`);
    if (!erroresHtml.length) erroresHtml.push(`<div style="padding:8px 10px;background:#f0fdf4;border-left:3px solid #10b981;border-radius:3px;font-size:13px;color:#065f46;">✓ sin errores destacados</div>`);
    html.push(erroresHtml.join(''));
    html.push(`</td></tr>`);

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
