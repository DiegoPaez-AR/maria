// meeting-prep.js — programa avisos 15min antes de cada reunión
//
// Loop cada N minutos (default 5). Para cada evento en las próximas 2h:
//   - si no está marcado como all-day
//   - si todavía falta al menos unos minutos antes del "cuándo" de envío
//   - si NO existe ya un programado con razon='meeting_prep:<eventoId>'
// crea un programado para 15min antes del evento, texto precompuesto.
//
// El dispatch lo hace programados.js. Acá solo agendamos.
//
// Uso:
//   const { iniciarMeetingPrep } = require('./meeting-prep');
//   const interval = iniciarMeetingPrep({ waClient });   // waClient se pasa por simetría, no se usa acá
//   // (waClient es usado por programados.js cuando el programado vence)

const mem = require('./memory');
const g   = require('./google');

const DIEGO_WA_CUS   = process.env.DIEGO_WA || '541132317896@c.us';
const TZ             = process.env.MARIA_TZ || 'America/Argentina/Buenos_Aires';
const MINUTOS_ANTES  = Number(process.env.MEETING_PREP_MIN_ANTES || 15);
const VENTANA_HORAS  = Number(process.env.MEETING_PREP_VENTANA_H || 2);

function _razonPara(eventoId) { return `meeting_prep:${eventoId}`; }

function _destinoDiegoWA() {
  const lid = mem.getEstado('diego_wa_lid');
  return lid || DIEGO_WA_CUS;
}

function _componerTexto(e) {
  const d = new Date(e.start);
  const hm = d.toLocaleTimeString('es-AR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
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

async function tick() {
  let eventos;
  try {
    eventos = await g.listarEventosProximos({ dias: Math.max(1, Math.ceil(VENTANA_HORAS / 24)), max: 30 });
  } catch (err) {
    console.warn('[meeting-prep] listar calendario falló:', err.message);
    return;
  }

  const ahora = Date.now();
  const limite = ahora + VENTANA_HORAS * 3600 * 1000;

  let programados = 0;
  for (const e of eventos) {
    if (e.allDay) continue;
    if (!e.start) continue;
    const inicio = new Date(e.start).getTime();
    if (isNaN(inicio)) continue;
    if (inicio < ahora) continue;          // ya arrancó
    if (inicio > limite) continue;         // fuera de ventana

    const cuandoAlerta = new Date(inicio - MINUTOS_ANTES * 60 * 1000);
    if (cuandoAlerta.getTime() <= ahora) continue; // ya pasó la ventana de alerta

    const razon = _razonPara(e.id);
    if (mem.existeProgramadoFuturo(razon)) continue; // ya agendado

    try {
      const id = mem.programarMensaje({
        cuando: cuandoAlerta,
        canal: 'whatsapp',
        destino: _destinoDiegoWA(),
        asunto: null,
        texto: _componerTexto(e),
        razon,
        metadata: { eventoId: e.id, summary: e.summary, inicio: e.start },
      });
      programados++;
      console.log(`[meeting-prep] + id=${id} ${e.summary} @ ${cuandoAlerta.toISOString()}`);
    } catch (err) {
      console.error('[meeting-prep] programar falló:', err.message);
    }
  }
  if (programados) {
    mem.log({
      canal: 'sistema', direccion: 'interno',
      cuerpo: `meeting-prep: ${programados} alerta(s) agendada(s)`,
    });
  }
}

function iniciarMeetingPrep({ intervaloMs = 5 * 60_000 } = {}) {
  console.log(`[meeting-prep] activo, chequeo cada ${intervaloMs/60_000}min, alerta ${MINUTOS_ANTES}min antes`);
  // Tick inicial inmediato
  tick().catch(err => console.error('[meeting-prep] tick inicial:', err));
  return setInterval(() => {
    tick().catch(err => console.error('[meeting-prep] tick:', err));
  }, intervaloMs);
}

module.exports = { iniciarMeetingPrep, tick };
