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
const waSend = require('./wa-send');
const providers = require('./providers');
const clima = require('./clima');

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
  const provider = await providers.forUser(usuario);
  const prox = await provider.listarEventosDelUsuario(usuario, { dias: 1, max: 20 });
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
  const hoy = horaMinEnTz(usuario.tz);
  const items = [];

  // 1) Cumples desde el calendar de Maria (calendario de cumpleaños).
  //    No depende del provider del usuario — siempre es el calendar de Maria.
  try {
    const mariaProvider = await providers.forMaria();
    const lista = await mariaProvider.listarCumples({ dias: 2 });
    for (const e of lista) {
      if ((e.start || '').startsWith(hoy.yyyymmdd)) items.push(`🎂 ${e.summary}`);
    }
  } catch (err) {
    console.warn(`[morning-brief/${usuario.nombre}] cumples Google falló:`, err.message);
  }

  // 2) Cumples desde la libreta de Maria (privados del usuario + públicos).
  //    Esto es independiente del calendar de Google: aunque Google no esté
  //    configurado, los cumples que cargó alguien por vCard o comando van.
  try {
    const cs = mem.cumpleañerosDelDia({ usuarioId: usuario.id, mes: hoy.mes, dia: hoy.dia });
    for (const c of cs) {
      const visTag = c.visibilidad === 'publica' ? ' (compartido)' : '';
      items.push(`🎂 ${c.nombre}${visTag}`);
    }
  } catch (err) {
    console.warn(`[morning-brief/${usuario.nombre}] cumples libreta falló:`, err.message);
  }

  if (!items.length) return null;
  // Deduplicar por nombre case-insensitive (puede pasar que Google y libreta
  // tengan el mismo Juan).
  const vistos = new Set();
  const dedup = [];
  for (const it of items) {
    const k = it.toLowerCase();
    if (vistos.has(k)) continue;
    vistos.add(k);
    dedup.push(it);
  }
  return dedup.join('\n');
}

function _pendientesLista(usuario) {
  // Solo los que son del usuario. Las tareas propias de Maria (dueno='maria')
  // van aparte, en _gestionandoLista.
  const ps = mem.listarPendientes(usuario.id).filter(p => (p.dueno || 'usuario') === 'usuario');
  if (!ps.length) return null;
  return ps.map((p, i) => `${i+1}. ${p.desc}`).join('\n');
}

function _gestionandoLista(usuario) {
  // Tareas propias de Maria para este usuario (dueno='maria'): lo que ella está
  // gestionando o esperando en su nombre (incluye los trigger_externo a la
  // espera de un tercero). Se listan en el brief para darle visibilidad —
  // antes quedaban invisibles. Texto crudo del desc (el brief lo arma código,
  // no el LLM).
  const ps = mem.listarPendientes(usuario.id).filter(p => (p.dueno || 'usuario') === 'maria');
  if (!ps.length) return null;
  return ps.map(p => `- ${p.desc}`).join('\n');
}

// Linea de clima para el brief. Usa lat/lon cacheados; si no los hay pero el
// usuario tiene ubicacion en texto, geocodifica una vez y la persiste. Si no
// hay ubicacion, devuelve null y el brief omite la seccion (sin romper nada).
async function _climaHoy(usuario) {
  let lat = usuario.lat;
  let lon = usuario.lon;
  if ((lat == null || lon == null) && usuario.ubicacion) {
    try {
      const geo = await clima.geocodificar(usuario.ubicacion);
      if (geo) {
        lat = geo.lat; lon = geo.lon;
        usuarios.setUbicacionCoords(usuario.id, lat, lon);
      }
    } catch (err) {
      console.warn(`[morning-brief/${usuario.nombre}] geocoding fallo:`, err.message);
    }
  }
  if (lat == null || lon == null) return null;
  try {
    const pr = await clima.pronosticoHoy(lat, lon, usuario.tz);
    if (!pr || (pr.min == null && pr.max == null)) return null;
    let linea = `${pr.emoji} ${pr.desc}`;
    if (pr.min != null && pr.max != null) linea += `, min ${pr.min}° / max ${pr.max}°`;
    else if (pr.max != null) linea += `, max ${pr.max}°`;
    if (pr.probLluvia != null && pr.probLluvia >= 30) linea += ` · ${pr.probLluvia}% prob. de lluvia`;
    return linea;
  } catch (err) {
    console.warn(`[morning-brief/${usuario.nombre}] clima fallo:`, err.message);
    return null;
  }
}

async function componerBrief(usuario) {
  const t = horaMinEnTz(usuario.tz);
  const dowIdx = new Date(Date.UTC(t.year, t.mes - 1, t.dia)).getUTCDay();
  const fecha  = `${DIAS_SEMANA[dowIdx]} ${t.dia} de ${MESES[t.mes - 1]}`;

  const [agenda, cumples, climaLinea] = await Promise.all([_agendaHoy(usuario), _cumplesHoy(usuario), _climaHoy(usuario)]);
  const pendientes = _pendientesLista(usuario);
  const gestionando = _gestionandoLista(usuario);

  let out = `☀️ *Buen día, ${usuario.nombre}.* ${fecha}.\n\n`;
  if (climaLinea) out += `*🌡️ Clima${usuario.ubicacion ? ' en ' + usuario.ubicacion : ''}*\n${climaLinea}\n\n`;
  out += `*📅 Agenda del día*\n${agenda}\n`;
  if (cumples)   out += `\n*Cumpleaños hoy*\n${cumples}\n`;
  if (pendientes) out += `\n*📝 Pendientes*\n${pendientes}\n`;
  if (gestionando) out += `\n*🔄 Gestionando para vos*\n${gestionando}\n`;
  return out.trim();
}

// ─── Envío ───────────────────────────────────────────────────────────────

async function enviarBrief(waClient, usuario) {
  if (!waClient) {
    console.warn(`[morning-brief/${usuario.nombre}] no hay waClient — salteo`);
    return false;
  }

  if (!usuario.wa_lid && !usuario.wa_cus) {
    console.warn(`[morning-brief/${usuario.nombre}] sin destino WA — salteo`);
    return false;
  }

  const texto = await componerBrief(usuario);

  const { destinoFinal } = await waSend.enviarWAUsuario(waClient, usuario, texto, {
    tag: `morning-brief/${usuario.nombre}`,
    metadata: { tipo: 'morning_brief' },
  });
  console.log(`[morning-brief/${usuario.nombre}] ✓ enviado a ${destinoFinal}`);
  return true;
}

// ─── Loop ────────────────────────────────────────────────────────────────

async function tickUsuario(waClient, usuario) {
  if (Number(usuario.brief_activo) === 0) return; // usuario pauso su brief (configurar_brief)
  const tz        = usuario.tz || 'America/Argentina/Buenos_Aires';
  const briefHora   = usuario.brief_hora   || '07'; // unificado a 07 (2026-06-11; schema y crear() ya decían 07/04 inconsistentes)
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
  const activos = usuarios.listarServidos();
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
