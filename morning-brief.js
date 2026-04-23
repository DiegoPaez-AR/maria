// morning-brief.js — envía a cada usuario activo un brief por WA en la madrugada
//
// Contenido por usuario: fecha, agenda del día (su calendario), cumples,
// pendientes. NO incluye emails.
//
// Implementación: setInterval cada 60s. Para cada usuario activo:
//   - chequea la hora local en SU tz
//   - si estamos en ventana [brief_hora:brief_minuto, +VENTANA_H) y no se
//     mandó hoy (estado_usuario.morning_brief_ultimo_dia) → compone y envía.
// La ventana da margen para reintentar si un tick falla por frame muerto o
// por otra caída puntual.

const mem = require('./memory');
const g   = require('./google');
const usuarios = require('./usuarios');

const BRIEF_VENTANA_H = Number(process.env.BRIEF_VENTANA_H || 4);
const ESTADO_KEY      = 'morning_brief_ultimo_dia';

const DIAS_SEMANA = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

// ─── Helpers de tiempo ──────────────────────────────────────────────────

function horaMinEnTz(tz, date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
    hour12: false,
  }).formatToParts(date).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
  return {
    hora: parts.hour,
    minuto: parts.minute,
    yyyymmdd: `${parts.year}-${parts.month}-${parts.day}`,
    dia: Number(parts.day),
    mes: Number(parts.month),
    year: Number(parts.year),
  };
}

// ─── Composición del brief ──────────────────────────────────────────────

async function _agendaHoy(usuario) {
  const hoy = horaMinEnTz(usuario.tz || 'America/Argentina/Buenos_Aires');
  const prox = await g.listarEventosProximos({ dias: 1, max: 20, calendarId: usuario.calendar_id });
  const items = prox.filter(e => {
    if (e.allDay) return e.start && e.start.startsWith(hoy.yyyymmdd);
    const d = horaMinEnTz(usuario.tz, new Date(e.start));
    return d.yyyymmdd === hoy.yyyymmdd;
  });
  if (!items.length) return '(sin eventos hoy)';
  return items.map(e => {
    if (e.allDay) return `• todo el día — ${e.summary}${e.ubicacion ? ' @' + e.ubicacion : ''}`;
    const hm = new Date(e.start).toLocaleTimeString('es-AR', { timeZone: usuario.tz, hour: '2-digit', minute: '2-digit' });
    return `• ${hm} — ${e.summary}${e.ubicacion ? ' @' + e.ubicacion : ''}`;
  }).join('\n');
}

async function _cumplesHoy(usuario) {
  // listarCumples usa su propio calendarId (contactos compartidos). Si no
  // está configurado, devolvemos null silenciosamente.
  try {
    const hoy = horaMinEnTz(usuario.tz);
    const lista = await g.listarCumples({ dias: 2 });
    const items = lista.filter(e => (e.start || '').startsWith(hoy.yyyymmdd));
    if (!items.length) return null;
    return items.map(e => `🎂 ${e.summary}`).join('\n');
  } catch (err) {
    console.warn(`[morning-brief/${usuario.nombre}] cumples falló:`, err.message);
    return null;
  }
}

function _pendientesLista(usuario) {
  const ps = mem.listarPendientes(usuario.id);
  if (!ps.length) return null;
  return ps.map((p, i) => `${i+1}. ${p.desc}`).join('\n');
}

async function componerBrief(usuario) {
  const t = horaMinEnTz(usuario.tz);
  const dowIdx = new Date(Date.UTC(t.year, t.mes - 1, t.dia)).getUTCDay();
  const fecha  = `${DIAS_SEMANA[dowIdx]} ${t.dia} de ${MESES[t.mes - 1]}`;

  const [agenda, cumples] = await Promise.all([_agendaHoy(usuario), _cumplesHoy(usuario)]);
  const pendientes = _pendientesLista(usuario);

  let out = `☀️ *Buen día, ${usuario.nombre}.* ${fecha}.\n\n`;
  out += `*📅 Agenda del día*\n${agenda}\n`;
  if (cumples)   out += `\n*Cumpleaños hoy*\n${cumples}\n`;
  if (pendientes) out += `\n*📝 Pendientes*\n${pendientes}\n`;
  return out.trim();
}

// ─── Envío ───────────────────────────────────────────────────────────────

async function enviarBrief(waClient, usuario) {
  if (!waClient) {
    console.warn(`[morning-brief/${usuario.nombre}] no hay waClient — salteo`);
    return false;
  }

  const destino = usuario.wa_lid || usuario.wa_cus;
  if (!destino) {
    console.warn(`[morning-brief/${usuario.nombre}] sin destino WA — salteo`);
    return false;
  }

  const texto = await componerBrief(usuario);

  try {
    await waClient.sendMessage(destino, texto);
  } catch (err) {
    if (waClient._watchdogFrameMuerto) waClient._watchdogFrameMuerto(err, `morning-brief/${usuario.nombre}`);
    throw err;
  }

  mem.log({
    usuarioId: usuario.id,
    canal: 'whatsapp', direccion: 'saliente',
    de: destino, cuerpo: texto,
    metadata: { tipo: 'morning_brief' },
  });
  console.log(`[morning-brief/${usuario.nombre}] ✓ enviado a ${destino}`);
  return true;
}

// ─── Loop ────────────────────────────────────────────────────────────────

async function tickUsuario(waClient, usuario) {
  const tz        = usuario.tz || 'America/Argentina/Buenos_Aires';
  const briefHora   = usuario.brief_hora   || '04';
  const briefMinuto = usuario.brief_minuto || '00';
  const t = horaMinEnTz(tz);

  const minsDesdeTarget = (Number(t.hora)   - Number(briefHora))   * 60
                        + (Number(t.minuto) - Number(briefMinuto));
  if (minsDesdeTarget < 0 || minsDesdeTarget >= BRIEF_VENTANA_H * 60) return;

  const ultimoDia = mem.getEstadoUsuario(usuario.id, ESTADO_KEY);
  if (ultimoDia === t.yyyymmdd) return; // ya mandamos hoy

  try {
    const ok = await enviarBrief(waClient, usuario);
    if (ok) mem.setEstadoUsuario(usuario.id, ESTADO_KEY, t.yyyymmdd);
  } catch (err) {
    console.error(`[morning-brief/${usuario.nombre}] enviar falló:`, err.message);
    mem.log({
      usuarioId: usuario.id,
      canal: 'sistema', direccion: 'interno',
      cuerpo: `morning-brief falló (${usuario.nombre}): ${err.message}`,
    });
  }
}

async function tick(waClient) {
  const activos = usuarios.listarActivos();
  for (const u of activos) {
    try { await tickUsuario(waClient, u); }
    catch (err) { console.error(`[morning-brief/${u.nombre}] tick:`, err.message); }
  }
}

function iniciarMorningBrief({ waClient, intervaloMs = 60_000 } = {}) {
  console.log(`[morning-brief] activo, ventana ${BRIEF_VENTANA_H}h, cada usuario en su tz`);
  return setInterval(() => {
    tick(waClient).catch(err => console.error('[morning-brief] tick:', err));
  }, intervaloMs);
}

module.exports = { iniciarMorningBrief, componerBrief, enviarBrief };
