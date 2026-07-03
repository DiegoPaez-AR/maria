// meeting-prep.js — programa avisos 15min antes de cada reunión, POR usuario
//
// Loop cada N minutos. Para cada usuario activo:
//   - lista eventos próximos de SU calendario
//   - para cada evento en las próximas 2h no all-day:
//     - si NO existe ya un programado con razon='meeting_prep:<usuarioId>:<eventoId>'
//       crea un programado para 15min antes del evento con destino = WA del usuario.
//
// El dispatch lo hace programados.js. Acá solo agendamos.

const loopGuard = require('./loop-guard');
const mem = require('./memory');
const g   = require('./google');
const usuarios = require('./usuarios');
const providers = require('./providers');
const { enriquecerContacto } = require('./enriquecer-contacto');
const i18n = require('./i18n');

const MINUTOS_ANTES = Number(process.env.MEETING_PREP_MIN_ANTES || 15);
const VENTANA_HORAS = Number(process.env.MEETING_PREP_VENTANA_H || 2);

function _razonPara(usuario, eventoId) { return `meeting_prep:${usuario.id}:${eventoId}`; }

function _destinoWA(usuario) {
  return usuario.wa_lid || usuario.wa_cus || null;
}

const _DOMINIOS_GENERICOS = new Set([
  'gmail.com','googlemail.com','hotmail.com','hotmail.com.ar','outlook.com','outlook.com.ar',
  'yahoo.com','yahoo.com.ar','icloud.com','me.com','live.com','proton.me','protonmail.com','aol.com',
]);

function _nombreDesdeEmail(email) {
  const local = String(email || '').split('@')[0] || '';
  const parts = local.replace(/[._+-]+/g, ' ').replace(/\d+/g, '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return null;
  return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}
function _empresaDesdeEmail(email) {
  const dom = (String(email || '').split('@')[1] || '').toLowerCase();
  if (!dom || _DOMINIOS_GENERICOS.has(dom)) return null;
  return dom;
}

// Approach B v2 (2026-07-03, pedido de Diego): los asistentes que NO están en
// la libreta se PERSISTEN como contacto privado del usuario (con su email) y
// se enriquecen con búsqueda web via enriquecerContacto (guarda perfil_web).
// Antes la investigación se hacía y se tiraba (la v1 _enriquecerAsistente
// quedó muerta y se eliminó). Cap 2 contactos nuevos por evento.

async function _componerTexto(e, usuario) {
  const tz = usuario.tz || 'America/Argentina/Buenos_Aires';
  const d = new Date(e.start);
  const hm = d.toLocaleTimeString(i18n.locale(usuario.idioma), { timeZone: tz, hour: '2-digit', minute: '2-digit' });
  const lugar = e.ubicacion ? ` @${e.ubicacion}` : '';
  // No incluir al propio usuario en la lista ni describirlo a sí mismo.
  const _yo = (usuario.email || '').toLowerCase().trim();
  const _esYo = (em) => { const x = String(em || '').toLowerCase().trim(); return !!x && !!_yo && x === _yo; };
  const attendees = (e.attendees || []).filter(a => a && !_esYo(a));
  const asistentes = attendees.slice(0, 6).join(', ');
  const TT = i18n.T(usuario.idioma);
  let txt = `${TT.enMin(MINUTOS_ANTES)} ${e.summary} (${hm})${lugar}`;
  if (asistentes) txt += `\n${TT.con} ${asistentes}`;
  // Contexto de los asistentes (2026-06-10): si el attendee está en la libreta
  // del usuario, anexar 1 línea de su nota curada (memoria de largo plazo) o,
  // si no hay, las notas de libreta. Máx 2 asistentes para no inflar el aviso.
  try {
    let agregadas = 0;
    let creados = 0;
    for (const em of attendees) {
      if (agregadas >= 2) break;
      const emailNorm = String(em).trim().toLowerCase();
      let c = mem.buscarContacto({ usuarioId: usuario.id, email: emailNorm });
      // Asistente desconocido → contacto privado nuevo + perfil web persistido.
      if (!c && creados < 2) {
        try {
          let nombreNuevo = _nombreDesdeEmail(em) || emailNorm.split('@')[0];
          // upsertContacto mergea por NOMBRE: si ya hay un contacto visible con
          // ese nombre (otra persona), desambiguar con el dominio para no
          // pisarlo ni shadowearlo (privada gana sobre pública en lookups).
          if (mem.buscarContacto({ usuarioId: usuario.id, nombre: nombreNuevo })) {
            nombreNuevo = `${nombreNuevo} (${emailNorm.split('@')[1] || 'ext'})`;
          }
          c = mem.upsertContacto({
            usuarioId: usuario.id, nombre: nombreNuevo, email: emailNorm,
            visibilidad: 'privada',
            notas: `asistente de "${e.summary}" (agregado automáticamente por meeting-prep)`,
          });
          creados++;
          const perfil = await enriquecerContacto(usuario.id, c); // best-effort, persiste perfil_web
          if (perfil) c = { ...c, perfil_web: perfil };
          console.log(`[meeting-prep/${usuario.nombre}] contacto nuevo: ${nombreNuevo} <${emailNorm}>${perfil ? ` — ${perfil}` : ''}`);
        } catch (err) {
          console.warn(`[meeting-prep/${usuario.nombre}] no pude crear contacto para ${emailNorm}:`, err.message);
        }
      }
      const nombre = c ? c.nombre : (_nombreDesdeEmail(em) || em);
      const nota = c ? mem.getNotaContacto(usuario.id, c.id) : null;
      let fuente = (nota && nota.nota) ? nota.nota : (c && c.notas) || null;
      // la nota de origen auto-generada es útil en la libreta, no en el aviso
      if (fuente && /agregado automáticamente por meeting-prep/.test(fuente)) fuente = null;
      // Perfil web (rol/empresa) ya enriquecido al crear el contacto.
      const web = c ? (c.perfil_web || null) : null;
      if (!fuente && !web) continue; // nada útil para este asistente
      let linea = `\n👤 ${nombre}`;
      if (web) linea += ` — ${web}`;
      if (fuente) {
        const plano = String(fuente).replace(/\s+/g, ' ').trim();
        linea += `: ${plano.slice(0, 120)}${plano.length > 120 ? '…' : ''}`;
      }
      txt += linea;
      agregadas++;
    }
  } catch (err) {
    console.warn(`[meeting-prep] notas/enriquecimiento de asistentes falló:`, err.message);
  }
  if (e.descripcion) {
    const desc = e.descripcion.replace(/\s+/g, ' ').slice(0, 200);
    txt += `\n${desc}`;
  }
  return txt;
}

async function _tickUsuario(usuario) {
  const destino = _destinoWA(usuario);
  if (!destino) return 0;
  // listarEventosDelUsuario decide internamente qué calendar leer según
  // el tier del user (calendar propio si tiene visibilidad; calendar de
  // Maria filtrado por attendee si es tier 0). Si no hay nada que listar
  // (tier 0 sin email), devuelve [] y el loop termina sin programar.
  let eventos;
  try {
    const provider = await providers.forUser(usuario);
    eventos = await provider.listarEventosDelUsuario(usuario, {
      dias: Math.max(1, Math.ceil(VENTANA_HORAS / 24)),
      max: 30,
    });
    loopGuard.reportar(`acceso_google:${usuario.nombre}`, true);
  } catch (err) {
    console.warn(`[meeting-prep/${usuario.nombre}] listar cal falló:`, err.message);
    if (loopGuard.esErrorAccesoGoogle(err)) loopGuard.reportar(`acceso_google:${usuario.nombre}`, false, err); // clave por usuario (2026-07-02)
    return 0;
  }
  if (!eventos.length) return 0;

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
    // Reagendar si el evento se movió (2026-06-11): si ya hay una alerta
    // programada para este evento pero con OTRO horario, cancelarla y
    // recrear — antes la alerta salía a la hora vieja, a veces después
    // de empezada la reunión.
    const progExistente = mem.programadoFuturoPorRazon(razon);
    if (progExistente) {
      const delta = Math.abs(new Date(progExistente.cuando).getTime() - cuandoAlerta.getTime());
      if (delta < 60_000) continue; // misma hora → nada que hacer
      mem.cancelarProgramado(progExistente.id);
      console.log(`[meeting-prep/${usuario.nombre}] evento ${e.summary} se movió — reagendando alerta (era ${progExistente.cuando})`);
    }
    // Si la alerta de este evento YA SALIÓ y el corrimiento es chico (<30min),
    // no re-avisar — duplicaba el aviso por micro-movidas del evento
    // (2026-07-02). Si se movió en serio, una alerta nueva con la hora nueva
    // es información útil y se programa igual.
    const progEnviado = mem.ultimoProgramadoEnviadoPorRazon(razon);
    if (progEnviado) {
      const deltaEnv = Math.abs(new Date(progEnviado.cuando).getTime() - cuandoAlerta.getTime());
      if (deltaEnv < 30 * 60_000) continue;
    }

    try {
      const id = mem.programarMensaje({
        usuarioId: usuario.id,
        cuando: cuandoAlerta,
        canal: 'whatsapp',
        destino,
        asunto: null,
        texto: await _componerTexto(e, usuario),
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
  const activos = usuarios.listarServidos();
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
