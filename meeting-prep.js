// meeting-prep.js — programa avisos 15min antes de cada reunión, POR usuario
//
// Loop cada N minutos. Para cada usuario activo:
//   - lista eventos próximos de SU calendario
//   - para cada evento en las próximas 2h no all-day:
//     - si NO existe ya un programado con razon='meeting_prep:<usuarioId>:<eventoId>'
//       crea un programado para 15min antes del evento con destino = WA del usuario.
//
// El dispatch lo hace programados.js. Acá solo agendamos.

const mem = require('./memory');
const g   = require('./google');
const usuarios = require('./usuarios');

const MINUTOS_ANTES = Number(process.env.MEETING_PREP_MIN_ANTES || 15);
const VENTANA_HORAS = Number(process.env.MEETING_PREP_VENTANA_H || 2);

function _razonPara(usuario, eventoId) { return `meeting_prep:${usuario.id}:${eventoId}`; }

function _destinoWA(usuario) {
  return usuario.wa_lid || usuario.wa_cus || null;
}

function _componerTexto(e, usuario) {
  const tz = usuario.tz || 'America/Argentina/Buenos_Aires';
  const d = new Date(e.start);
  const hm = d.toLocaleTimeString('es-AR', { timeZone: tz, hour: '2-digit', minute: '2-digit' });
  const lugar = e.ubicacion ? ` @${e.ubicacion}` : '';
  const asistentes = (e.attendees || []).filter(a => a).slice(0, 6).join(', ');
  let txt = `⏰ *En ${MINUTOS_ANTES}min*: ${e.summary} (${hm})${lugar}`;
  if (asistentes) txt += `\nCon: ${asistentes}`;
  if (e.descripcion) {
    const desc = e.descripcion.replace(/\s+/g, ' ').slice(0, 200);
    txt += `\n${desc}`;
  }
  return txt;
}

async function _tickUsuario(usuario) {
  const destino = _destinoWA(usuario);
  if (!destino) return 0;
  if (!usuario.calendar_id) return 0;

  let eventos;
  try {
    eventos = await g.listarEventosProximos({
      dias: Math.max(1, Math.ceil(VENTANA_HORAS / 24)),
      max: 30,
      calendarId: usuario.calendar_id,
    });
  } catch (err) {
    console.warn(`[meeting-prep/${usuario.nombre}] listar cal falló:`, err.message);
    return 0;
  }

  const ahora = Date.now();
  const limite = ahora + VENTANA_HORAS * 3600 * 1000;

  let programados = 0;
  for (const e of eventos) {
    if (e.allDay) continue;
    if (!e.start) continue;
    const inicio = new Date(e.start).getTime();
    if (isNaN(inicio)) continue;
    if (inicio < ahora)   continue;
    if (inicio > limite)  continue;

    const cuandoAlerta = new Date(inicio - MINUTOS_ANTES * 60 * 1000);
    if (cuandoAlerta.getTime() <= ahora) continue;

    const razon = _razonPara(usuario, e.id);
    if (mem.existeProgramadoFuturo(razon)) continue;

    try {
      const id = mem.programarMensaje({
        usuarioId: usuario.id,
        cuando: cuandoAlerta,
        canal: 'whatsapp',
        destino,
        asunto: null,
        texto: _componerTexto(e, usuario),
        razon,
        metadata: { eventoId: e.id, summary: e.summary, inicio: e.start },
      });
      programados++;
      console.log(`[meeting-prep/${usuario.nombre}] + id=${id} ${e.summary} @ ${cuandoAlerta.toISOString()}`);
    } catch (err) {
      console.error(`[meeting-prep/${usuario.nombre}] programar falló:`, err.message);
    }
  }
  return programados;
}

async function tick() {
  const activos = usuarios.listarActivos();
  let total = 0;
  for (const u of activos) {
    try { total += await _tickUsuario(u); }
    catch (err) { console.error(`[meeting-prep/${u.nombre}] tick:`, err.message); }
  }
  if (total) {
    mem.log({
      canal: 'sistema', direccion: 'interno',
      cuerpo: `meeting-prep: ${total} alerta(s) agendada(s) (${activos.length} usuarios)`,
    });
  }
}

function iniciarMeetingPrep({ intervaloMs = 5 * 60_000 } = {}) {
  console.log(`[meeting-prep] activo, cada ${intervaloMs/60_000}min, alerta ${MINUTOS_ANTES}min antes (multi-user)`);
  tick().catch(err => console.error('[meeting-prep] tick inicial:', err));
  return setInterval(() => {
    tick().catch(err => console.error('[meeting-prep] tick:', err));
  }, intervaloMs);
}

module.exports = { iniciarMeetingPrep, tick };
