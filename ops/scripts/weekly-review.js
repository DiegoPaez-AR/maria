#!/usr/bin/env node
// ops/scripts/weekly-review.js — digest SEMANAL por instancia (2026-09-09,
// pedido Diego: "un reporte semanal de revisión"). Cruza lo que antes había
// que juntar a mano: tabla eventos (mensajes, acciones, costo), logs de pm2,
// wa_outbox, follow-ups/pendientes, MariaBridge, commits de la semana.
//
// Salida: ops/instances/<slug>/reviews/<YYYY>-W<ww>.md (el cron-master lo
// pushea al repo) + UN mail al operador (OWNER_EMAIL del primer .conf) con
// todas las instancias. Crontab: domingos 05:00 (después del reconcile).
//
// Uso: node ops/scripts/weekly-review.js [--dias 7] [--no-mail] [--solo <slug>]
// NO requiere módulos con side effects (nada de ./index ni ./daily-report):
// abre las DB en modo readonly con better-sqlite3.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const Database = require('better-sqlite3');

const ROOT = '/root/secretaria';
const INSTANCES_DIR = path.join(ROOT, 'config', 'instances');
const LOGS_DIR = process.env.MARIA_LOGS_DIR || path.join(ROOT, 'logs');
const TZ_OFF = '-3 hours';
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const DIAS = Number(arg('--dias', 7));
const NO_MAIL = args.includes('--no-mail');
const SOLO = arg('--solo', null);

function parseConf(file) {
  const env = {};
  for (let line of fs.readFileSync(file, 'utf8').split('\n')) {
    line = line.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    env[line.slice(0, eq).trim()] = v;
  }
  return env;
}
function confs() {
  return fs.readdirSync(INSTANCES_DIR).filter(f => f.endsWith('.conf')).map(f => path.join(INSTANCES_DIR, f)).sort();
}
function isoWeek(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-W${String(Math.ceil((((t - y0) / 86400000) + 1) / 7)).padStart(2, '0')}`;
}
const fmtUsd = n => `US$${(Number(n) || 0).toFixed(2)}`;
const tabla = (cabeceras, filas) => {
  if (!filas.length) return '_(nada)_\n';
  const l = [`| ${cabeceras.join(' | ')} |`, `| ${cabeceras.map(() => '---').join(' | ')} |`];
  for (const f of filas) l.push(`| ${f.map(x => String(x == null ? '' : x).replace(/\|/g, '/').replace(/\n/g, ' ')).join(' | ')} |`);
  return l.join('\n') + '\n';
};

// ── logs de pm2 (carpeta unificada, con fallback a ~/.pm2/logs) ──────────
function leerLog(slug, tipo, desdeYMD) {
  const candidatos = [
    path.join(LOGS_DIR, slug, `${tipo}.log`),
    `/root/.pm2/logs/${slug}-${tipo}.log`,
  ];
  const lineas = [];
  for (const f of candidatos) {
    if (!fs.existsSync(f)) continue;
    // también los rotados recientes (pm2-logrotate: out__2026-09-07_00-00-00.log)
    const dir = path.dirname(f), base = path.basename(f, '.log');
    const rotados = fs.readdirSync(dir).filter(x => x.startsWith(base + '__') && x.endsWith('.log')).map(x => path.join(dir, x)).sort();
    for (const g of [...rotados, f]) {
      try {
        for (const ln of fs.readFileSync(g, 'utf8').split('\n')) {
          if (ln.slice(0, 10) >= desdeYMD) lineas.push(ln);
        }
      } catch { /* noop */ }
    }
    break;
  }
  return lineas;
}
function agrupar(lineas, { limpiar = true, max = 15 } = {}) {
  const c = new Map();
  for (let ln of lineas) {
    ln = ln.replace(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}: /, '');
    if (limpiar) ln = ln.replace(/\d{2}:\d{2}:\d{2}/g, '').replace(/#\d+/g, '#N').replace(/\+?\d{10,15}/g, '<num>');
    ln = ln.slice(0, 110).trim();
    if (!ln) continue;
    c.set(ln, (c.get(ln) || 0) + 1);
  }
  return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, max);
}

function revisarInstancia(cf, desdeUTC, desdeYMD) {
  const env = parseConf(cf);
  const slug = env.ASISTENTE_SLUG || path.basename(cf, '.conf');
  const nombre = env.ASISTENTE_NOMBRE || slug;
  const dbPath = env.MARIA_DB || path.join(ROOT, 'state', slug, 'db', 'maria.sqlite');
  const out = { slug, nombre, md: '', resumen: {} };
  if (!fs.existsSync(dbPath)) { out.md = `## ${nombre} (${slug})\n\n_(sin DB en ${dbPath})_\n`; return out; }
  const db = new Database(dbPath, { readonly: true });
  const q = (sql, ...p) => { try { return db.prepare(sql).all(...p); } catch (e) { return [{ error: e.message }]; } };
  const q1 = (sql, ...p) => { try { return db.prepare(sql).get(...p); } catch (e) { return { error: e.message }; } };

  const usuarios = q1(`SELECT COUNT(*) activos, SUM(COALESCE(pausado,0)) pausados, SUM(telegram_chat_id IS NOT NULL) con_tg, SUM(servido=1) servidos FROM usuarios WHERE activo=1`);
  const porDia = q(`SELECT date(timestamp,'${TZ_OFF}') dia,
      SUM(canal='telegram' AND direccion='entrante') tg_in, SUM(canal='telegram' AND direccion='saliente') tg_out,
      SUM(canal='whatsapp' AND direccion='entrante') wa_in, SUM(canal='whatsapp' AND direccion='saliente') wa_out,
      SUM(canal='gmail' AND direccion='entrante') mail_in, SUM(canal='gmail' AND direccion='saliente') mail_out,
      SUM(canal='calendar') cal
    FROM eventos WHERE timestamp >= ? GROUP BY 1 ORDER BY 1`, desdeUTC);
  const gasto = q(`SELECT date(timestamp,'${TZ_OFF}') dia, COUNT(*) llamadas,
      ROUND(SUM(CAST(substr(cuerpo, instr(cuerpo,'$')+1) AS REAL)),2) usd
    FROM eventos WHERE canal='sistema' AND cuerpo LIKE 'claude_call%' AND timestamp >= ? GROUP BY 1 ORDER BY 1`, desdeUTC);
  const gastoTot = gasto.reduce((a, r) => a + (Number(r.usd) || 0), 0);
  const llamadasTot = gasto.reduce((a, r) => a + (Number(r.llamadas) || 0), 0);
  const gastoPorTipo = q(`SELECT substr(cuerpo, 13, instr(substr(cuerpo,13),':')-1) tipo, COUNT(*) n,
      ROUND(SUM(CAST(substr(cuerpo, instr(cuerpo,'$')+1) AS REAL)),2) usd
    FROM eventos WHERE canal='sistema' AND cuerpo LIKE 'claude_call%' AND timestamp >= ? GROUP BY 1 ORDER BY 3 DESC`, desdeUTC);
  const quien = q(`SELECT COALESCE(u.nombre, e.nombre, e.de) quien, e.canal, COUNT(*) n
    FROM eventos e LEFT JOIN usuarios u ON u.id=e.usuario_id AND e.canal='telegram'
    WHERE e.timestamp >= ? AND e.direccion='entrante' GROUP BY 1,2 ORDER BY 3 DESC LIMIT 15`, desdeUTC);
  const acciones = q(`SELECT substr(cuerpo, 18) accion, COUNT(*) n FROM eventos
    WHERE canal='sistema' AND cuerpo LIKE 'acción ejecutada: %' AND timestamp >= ? GROUP BY 1 ORDER BY 2 DESC LIMIT 15`, desdeUTC);
  const fallidas = q(`SELECT datetime(timestamp,'${TZ_OFF}') ts, substr(cuerpo, 1, 160) c FROM eventos
    WHERE canal='sistema' AND cuerpo LIKE 'acción FALLÓ%' AND timestamp >= ? ORDER BY timestamp`, desdeUTC);
  const sistema = q(`SELECT datetime(timestamp,'${TZ_OFF}') ts, substr(replace(cuerpo,char(10),' '), 1, 170) c FROM eventos
    WHERE canal='sistema' AND timestamp >= ? AND cuerpo NOT LIKE 'claude_call%' AND cuerpo NOT LIKE 'acción %'
      AND cuerpo NOT LIKE '%arrancó%' AND cuerpo NOT LIKE '%shutdown%' AND cuerpo NOT LIKE 'meeting-prep%'
      AND cuerpo NOT LIKE 'poda-eventos%' AND cuerpo NOT LIKE '%memoria-curada%' AND cuerpo NOT LIKE 'consulta %'
    ORDER BY timestamp LIMIT 60`, desdeUTC);
  const outbox = q(`SELECT estado, COUNT(*) n FROM wa_outbox WHERE creado >= ? GROUP BY 1`, desdeUTC);
  const outboxMal = q(`SELECT id, datetime(creado,'${TZ_OFF}') ts, numero, estado, intentos, substr(replace(texto,char(10),' '),1,70) t
    FROM wa_outbox WHERE creado >= ? AND estado NOT IN ('entregado') ORDER BY id LIMIT 12`, desdeUTC);
  const fus = q(`SELECT id, estado, datetime(creado,'${TZ_OFF}') ts, substr(descripcion,1,90) d FROM follow_ups WHERE estado IN ('abierto','disparado') ORDER BY id DESC LIMIT 10`);
  const pend = q(`SELECT id, dueno, substr("desc",1,90) d FROM pendientes WHERE estado='abierto' ORDER BY id DESC LIMIT 12`);
  const contactosNuevos = q1(`SELECT COUNT(*) n FROM contactos WHERE creado >= ?`, desdeUTC);
  db.close();

  const errLog = leerLog(slug, 'error', desdeYMD);
  const outLog = leerLog(slug, 'out', desdeYMD);
  const errores = agrupar(errLog.filter(l => !/TG\] poll error/.test(l)));
  const tgCortes = errLog.filter(l => /TG\] poll error/.test(l)).length;
  const prosa = errLog.filter(l => /respuesta en PROSA/.test(l)).length;
  const mbVersion = (outLog.map(l => (l.match(/\[MB v([0-9.]+)\]/) || [])[1]).filter(Boolean).pop()) || '?';
  const mbRaros = agrupar(outLog.filter(l => /\[MB/.test(l) && / (W|E) /.test(l)), { max: 12 });
  const warns = agrupar(outLog.filter(l => /warn|fall[oó]|descart|inconclus|duplicado|expirado|presentacion|loop-guard|watchdog\] .*(ca[ií]d|mudo)/i.test(l) && !/\[MB/.test(l)), { max: 15 });

  out.resumen = { usuarios, gastoTot, llamadasTot, prosa, tgCortes, fallidas: fallidas.length, mbVersion, contactosNuevos: contactosNuevos && contactosNuevos.n };
  const md = [];
  md.push(`## ${nombre} (${slug})\n`);
  md.push(`**Usuarios**: ${usuarios.activos} activos (${usuarios.servidos} atendidos, ${usuarios.pausados} pausados, ${usuarios.con_tg} con Telegram) · **contactos nuevos**: ${contactosNuevos.n} · **MariaBridge**: v${mbVersion}\n`);
  md.push(`**Gasto**: ${fmtUsd(gastoTot)} en ${llamadasTot} llamadas (${llamadasTot ? fmtUsd(gastoTot / llamadasTot) : '-'} por llamada) · modo prosa: ${prosa} · cortes Telegram: ${tgCortes} · acciones fallidas: ${fallidas.length}\n`);
  md.push(`### Actividad por día\n` + tabla(['día', 'TG in', 'TG out', 'WA in', 'WA out', 'mail in', 'mail out', 'cal'], porDia.map(r => [r.dia, r.tg_in, r.tg_out, r.wa_in, r.wa_out, r.mail_in, r.mail_out, r.cal])));
  md.push(`### Gasto por día\n` + tabla(['día', 'llamadas', 'USD'], gasto.map(r => [r.dia, r.llamadas, r.usd])));
  md.push(`### Gasto por tipo de llamada\n` + tabla(['tipo', 'n', 'USD'], gastoPorTipo.map(r => [r.tipo, r.n, r.usd])));
  md.push(`### Quién escribió\n` + tabla(['quién', 'canal', 'n'], quien.map(r => [r.quien, r.canal, r.n])));
  md.push(`### Acciones ejecutadas\n` + tabla(['acción', 'n'], acciones.map(r => [r.accion, r.n])));
  md.push(`### Acciones FALLIDAS\n` + tabla(['cuándo', 'qué'], fallidas.map(r => [r.ts, r.c])));
  md.push(`### Avisos de sistema (no rutinarios)\n` + tabla(['cuándo', 'qué'], sistema.map(r => [r.ts, r.c])));
  md.push(`### WhatsApp saliente (wa_outbox)\n` + tabla(['estado', 'n'], outbox.map(r => [r.estado, r.n])) + (outboxMal.length ? '\nNo entregados:\n' + tabla(['id', 'cuándo', 'número', 'estado', 'intentos', 'texto'], outboxMal.map(r => [r.id, r.ts, r.numero, r.estado, r.intentos, r.t])) : ''));
  md.push(`### Follow-ups vivos\n` + tabla(['id', 'estado', 'creado', 'qué'], fus.map(r => [r.id, r.estado, r.ts, r.d])));
  md.push(`### Pendientes abiertos\n` + tabla(['id', 'dueño', 'qué'], pend.map(r => [r.id, r.dueno, r.d])));
  md.push(`### error.log agrupado (sin cortes de Telegram)\n` + tabla(['n', 'línea'], errores.map(([l, n]) => [n, l])));
  md.push(`### out.log: warnings / fallos agrupados\n` + tabla(['n', 'línea'], warns.map(([l, n]) => [n, l])));
  md.push(`### MariaBridge: warnings / errores\n` + tabla(['n', 'línea'], mbRaros.map(([l, n]) => [n, l])));
  out.md = md.join('\n');
  return out;
}

function commitsSemana(dias) {
  try {
    return execSync(`cd ${ROOT} && git log --since="${dias} days ago" --format="%ad %s" --date=format:"%d/%m %H:%M" | grep -vE "ops: (snapshot|consumed)" | grep -v "^.\\{12\\}inbox:" | head -40`, { encoding: 'utf8' }).trim();
  } catch { return ''; }
}
function saludVPS() {
  try {
    const disco = execSync('df -h / | tail -1', { encoding: 'utf8' }).trim().split(/\s+/);
    const mem = execSync('free -m | sed -n 2p', { encoding: 'utf8' }).trim().split(/\s+/);
    const logsSize = fs.existsSync(LOGS_DIR) ? execSync(`du -sh ${LOGS_DIR} | cut -f1`, { encoding: 'utf8' }).trim() : '(sin carpeta logs)';
    const pm2 = JSON.parse(execSync('pm2 jlist', { encoding: 'utf8' })).map(p => `${p.name}: ${p.pm2_env.status}, ${p.pm2_env.restart_time} restarts, up ${Math.round((Date.now() - p.pm2_env.pm_uptime) / 3600000)}h`).join(' · ');
    return `disco ${disco[4]} usado (${disco[3]} libres) · RAM ${mem[2]}/${mem[1]} MB · logs: ${logsSize} · pm2: ${pm2}`;
  } catch (e) { return `(no pude leer: ${e.message})`; }
}

async function main() {
  const ahora = new Date();
  const desde = new Date(ahora.getTime() - DIAS * 86400000);
  const desdeUTC = desde.toISOString().replace('T', ' ').slice(0, 19);
  const desdeYMD = new Date(desde.getTime() - 3 * 3600000).toISOString().slice(0, 10);
  const semana = isoWeek(ahora);
  const lista = confs().filter(cf => !SOLO || path.basename(cf, '.conf') === SOLO);
  const partes = [];
  const resumenes = [];
  for (const cf of lista) {
    const r = revisarInstancia(cf, desdeUTC, desdeYMD);
    const dir = path.join(ROOT, 'ops', 'instances', r.slug, 'reviews');
    fs.mkdirSync(dir, { recursive: true });
    const cab = `# Revisión semanal ${semana} — ${r.nombre}\n\n_Generada ${ahora.toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })} · últimos ${DIAS} días (desde ${desdeYMD})_\n\n`;
    fs.writeFileSync(path.join(dir, `${semana}.md`), cab + r.md);
    partes.push(r.md);
    resumenes.push(r);
    console.log(`✓ ${r.slug}: ${fmtUsd(r.resumen.gastoTot || 0)}, ${r.resumen.llamadasTot || 0} llamadas`);
  }
  const commits = commitsSemana(DIAS);
  const salud = saludVPS();
  const cabecera = `# Revisión semanal ${semana}\n\n_Últimos ${DIAS} días (desde ${desdeYMD}) · generada ${ahora.toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}_\n\n` +
    `**Resumen**: ${resumenes.map(r => `${r.nombre} ${fmtUsd(r.resumen.gastoTot || 0)} / ${r.resumen.llamadasTot || 0} llamadas, ${r.resumen.fallidas} fallidas, MB v${r.resumen.mbVersion}`).join(' · ')}\n\n` +
    `**VPS**: ${salud}\n\n` +
    `### Cambios deployados en la semana\n\n${commits ? '```\n' + commits + '\n```' : '_(ninguno)_'}\n\n---\n\n`;
  const texto = cabecera + partes.join('\n\n---\n\n');
  fs.writeFileSync(path.join(ROOT, 'ops', 'instances', 'weekly-review-ultima.md'), texto);
  if (NO_MAIL) { console.log(texto.slice(0, 3000)); return; }

  // Mail al operador con la primera instancia (igual que daily-report).
  const adminEnv = parseConf(lista[0] || confs()[0]);
  const secrets = fs.existsSync(path.join(ROOT, 'config', 'secrets.conf')) ? parseConf(path.join(ROOT, 'config', 'secrets.conf')) : {};
  for (const [k, v] of Object.entries({ ...adminEnv, ...secrets })) if (!process.env[k]) process.env[k] = v;
  const g = require(path.join(ROOT, 'google'));
  const destino = adminEnv.OWNER_EMAIL || process.env.OWNER_EMAIL;
  if (!destino) { console.error('sin OWNER_EMAIL'); process.exit(1); }
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // Markdown mínimo → HTML (títulos, tablas, código). Suficiente para leerlo en Gmail.
  const html = ['<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:13px;color:#222">'];
  let enTabla = false, enCode = false;
  for (const ln of texto.split('\n')) {
    if (ln.startsWith('```')) { enCode = !enCode; html.push(enCode ? '<pre style="background:#f4f4f4;padding:8px;font-size:11px">' : '</pre>'); continue; }
    if (enCode) { html.push(esc(ln)); continue; }
    if (ln.startsWith('|')) {
      const celdas = ln.slice(1, -1).split('|').map(x => x.trim());
      if (celdas.every(c => /^-+$/.test(c))) continue;
      if (!enTabla) { html.push('<table style="border-collapse:collapse;font-size:12px;margin:6px 0">'); enTabla = true; }
      html.push('<tr>' + celdas.map(c => `<td style="border:1px solid #ddd;padding:2px 6px">${esc(c)}</td>`).join('') + '</tr>');
      continue;
    }
    if (enTabla) { html.push('</table>'); enTabla = false; }
    if (ln.startsWith('# ')) html.push(`<h2>${esc(ln.slice(2))}</h2>`);
    else if (ln.startsWith('## ')) html.push(`<h3 style="margin-top:22px;border-top:2px solid #333;padding-top:8px">${esc(ln.slice(3))}</h3>`);
    else if (ln.startsWith('### ')) html.push(`<h4 style="margin:12px 0 4px">${esc(ln.slice(4))}</h4>`);
    else if (ln.trim() === '---') html.push('<hr>');
    else if (ln.trim()) html.push(`<p style="margin:4px 0">${esc(ln).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/_(.+?)_/g, '<i>$1</i>')}</p>`);
  }
  if (enTabla) html.push('</table>');
  html.push('</div>');
  await g.enviarEmail({ to: destino, asunto: `🗓️ Revisión semanal ${semana} — Maria`, texto, html: html.join('\n') });
  console.log(`✓ mail enviado a ${destino}`);
}

main().catch(err => { console.error('weekly-review falló:', err); process.exit(1); });
