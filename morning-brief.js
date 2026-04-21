// morning-brief.js — envía a Diego un brief por WhatsApp en la madrugada (hora AR)
//
// Contenido: fecha, agenda del día, cumpleaños del día, pendientes.
// (Diego pidió NO incluir emails.)
//
// Implementación: setInterval cada 60s, chequea la hora local en MARIA_TZ.
// Si ya estamos dentro de la ventana de envío (target … target+VENTANA_H) y todavía
// no se mandó hoy, compone y envía. La ventana da margen para reintentar si un
// tick falla por WA frame muerto + pm2 restart (~20s) o por otra caída puntual.
// Usamos mem.estado como flag "último día enviado" para idempotencia.
//
// Uso:
//   const { iniciarMorningBrief } = require('./morning-brief');
//   const interval = iniciarMorningBrief({ waClient });

const mem = require('./memory');
const g   = require('./google');

const DIEGO_WA_CUS = process.env.DIEGO_WA || '541132317896@c.us';
const TZ           = process.env.MARIA_TZ || 'America/Argentina/Buenos_Aires';
const BRIEF_HORA    = process.env.BRIEF_HORA    || '04';
const BRIEF_MINUTO  = process.env.BRIEF_MINUTO  || '00';
const BRIEF_VENTANA_H = Number(process.env.BRIEF_VENTANA_H || 4); // reintenta dentro de esta ventana en horas
const ESTADO_KEY    = 'morning_brief_ultimo_dia';

const DIAS_SEMANA = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

// ─── Helpers de tiempo ──────────────────────────────────────────────────

function horaMinTZ(date = new Date()) {
  // Devuelve {hora, minuto, yyyymmdd} en la TZ configurada
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
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

function _salto(linea) { return linea ? linea + '\n' : ''; }

async function _agendaHoy() {
  // Eventos de hoy, filtrando los que empiezan hoy (TZ local)
  const hoy = horaMinTZ();
  const prox = await g.listarEventosProximos({ dias: 1, max: 20 });
  const items = prox.filter(e => {
    if (e.allDay) {
      return e.start && e.start.startsWith(hoy.yyyymmdd);
    }
    const d = horaMinTZ(new Date(e.start));
    return d.yyyymmdd === hoy.yyyymmdd;
  });
  if (!items.length) return '(sin eventos hoy)';
  return items.map(e => {
    if (e.allDay) return `• todo el día — ${e.summary}${e.ubicacion ? ' @' + e.ubicacion : ''}`;
    const hm = new Date(e.start).toLocaleTimeString('es-AR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
    return `• ${hm} — ${e.summary}${e.ubicacion ? ' @' + e.ubicacion : ''}`;
  }).join('\n');
}

async function _cumplesHoy() {
  try {
    const hoy = horaMinTZ();
    const lista = await g.listarCumples({ dias: 2 });
    const items = lista.filter(e => {
      const start = e.start || '';
      return start.startsWith(hoy.yyyymmdd);
    });
    if (!items.length) return null;
    return items.map(e => `🎂 ${e.summary}`).join('\n');
  } catch (err) {
    console.warn('[morning-brief] cumples falló:', err.message);
    return null;
  }
}

function _pendientesLista() {
  const ps = mem.listarPendientes();
  if (!ps.length) return null;
  return ps.map((p, i) => `${i+1}. ${p.desc}`).join('\n');
}

async function componerBrief() {
  const t = horaMinTZ();
  const dowIdx = new Date(Date.UTC(t.year, t.mes - 1, t.dia)).getUTCDay();
  const fecha  = `${DIAS_SEMANA[dowIdx]} ${t.dia} de ${MESES[t.mes - 1]}`;

  const [agenda, cumples] = await Promise.all([_agendaHoy(), _cumplesHoy()]);
  const pendientes = _pendientesLista();

  let out = `☀️ *Buen día, Diego.* ${fecha}.\n\n`;
  out += `*📅 Agenda del día*\n${agenda}\n`;
  if (cumples) {
    out += `\n*Cumpleaños hoy*\n${cumples}\n`;
  }
  if (pendientes) {
    out += `\n*📝 Pendientes*\n${pendientes}\n`;
  }
  return out.trim();
}

// ─── Envío ───────────────────────────────────────────────────────────────

async function enviarBrief(waClient) {
  if (!waClient) {
    console.warn('[morning-brief] no hay waClient — salteo el envío');
    return false;
  }

  const texto = await componerBrief();

  // Resolver destino (@c.us legacy → @lid)
  let destino = DIEGO_WA_CUS;
  const lid = mem.getEstado('diego_wa_lid');
  if (lid) destino = lid;

  try {
    await waClient.sendMessage(destino, texto);
  } catch (err) {
    const esLidError = /No LID for user|invalid wid|not.{0,10}registered/i.test(err.message || '');
    if (esLidError && lid && lid !== destino) {
      await waClient.sendMessage(lid, texto);
      destino = lid;
    } else {
      if (waClient._watchdogFrameMuerto) waClient._watchdogFrameMuerto(err, 'morning-brief');
      throw err;
    }
  }

  mem.log({
    canal: 'whatsapp', direccion: 'saliente',
    de: destino, cuerpo: texto,
    metadata: { tipo: 'morning_brief' },
  });
  console.log(`[morning-brief] ✓ enviado a ${destino}`);
  return true;
}

// ─── Loop ────────────────────────────────────────────────────────────────

async function tick(waClient) {
  const t = horaMinTZ();

  // Ventana de envío: [target, target + BRIEF_VENTANA_H). Si un tick falla
  // (frame muerto → pm2 restart, ~20s down), el próximo tick dentro de la
  // ventana reintenta. Fuera de la ventana no disparamos (evita briefs tardíos
  // si Maria recién arrancó a mitad del día sin haber mandado el de hoy).
  const minsDesdeTarget = (Number(t.hora)   - Number(BRIEF_HORA))   * 60
                        + (Number(t.minuto) - Number(BRIEF_MINUTO));
  if (minsDesdeTarget < 0 || minsDesdeTarget >= BRIEF_VENTANA_H * 60) return;

  const ultimoDia = mem.getEstado(ESTADO_KEY);
  if (ultimoDia === t.yyyymmdd) return; // ya mandamos hoy

  try {
    const ok = await enviarBrief(waClient);
    if (ok) mem.setEstado(ESTADO_KEY, t.yyyymmdd);
  } catch (err) {
    console.error('[morning-brief] enviar falló:', err.message);
    mem.log({
      canal: 'sistema', direccion: 'interno',
      cuerpo: `morning-brief falló: ${err.message}`,
    });
    // NO marcamos como enviado — reintentamos en el próximo tick (dentro del mismo minuto)
  }
}

function iniciarMorningBrief({ waClient, intervaloMs = 60_000 } = {}) {
  console.log(`[morning-brief] activo, disparo a las ${BRIEF_HORA}:${BRIEF_MINUTO} (${TZ}), ventana ${BRIEF_VENTANA_H}h`);
  return setInterval(() => {
    tick(waClient).catch(err => console.error('[morning-brief] tick:', err));
  }, intervaloMs);
}

module.exports = { iniciarMorningBrief, componerBrief, enviarBrief };
