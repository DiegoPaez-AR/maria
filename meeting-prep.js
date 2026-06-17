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
const { invocarClaude } = require('./claude-client');

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

// Approach B (2026-06-17): al PROGRAMAR el aviso, por cada asistente buscamos en
// la web su rol/empresa para darle contexto al usuario (LinkedIn no se puede
// consultar por email — perfiles cerrados/sin API —, pero una búsqueda
// nombre+empresa suele traer el cargo). Best-effort: si no hay datos confiables
// o falla, devuelve null y el aviso sigue sin esa línea.
async function _enriquecerAsistente({ email, nombre, usuario }) {
  const nom = nombre || _nombreDesdeEmail(email);
  if (!nom) return null;
  const empresa = _empresaDesdeEmail(email);
  const prompt = `Buscá en la web quién es esta persona, para darle contexto a ${usuario.nombre} antes de una reunión.
Persona: ${nom}${empresa ? ` (empresa probable según su email: ${empresa})` : ''}
Email: ${email}

Devolvé UNA sola línea corta (máx ~110 caracteres) con su ROL/CARGO y EMPRESA actuales si los encontrás con confianza razonable (ej: "Director Comercial en Acme" o "Founder & CEO, Acme"). Si no encontrás info confiable de ESTA persona, devolvé EXACTAMENTE: sin datos
No inventes ni completes con suposiciones. Sin comillas ni explicaciones: solo la línea.`;
  try {
    let r = await invocarClaude(prompt, { timeoutMs: 60_000, audit: { usuarioId: usuario.id, canal: 'meeting-prep-enrich' } });
    r = String(r || '').replace(/\s+/g, ' ').trim();
    if (!r || /^sin datos\.?$/i.test(r)) return null;
    return r.slice(0, 140);
  } catch (err) {
    console.warn(`[meeting-prep enrich] ${email} falló: ${err.message}`);
    return null;
  }
}

async function _componerTexto(e, usuario) {
  const tz = usuario.tz || 'America/Argentina/Buenos_Aires';
  const d = new Date(e.start);
  const hm = d.toLocaleTimeString('es-AR', { timeZone: tz, hour: '2-digit', minute: '2-digit' });
  const lugar = e.ubicacion ? ` @${e.ubicacion}` : '';
  // No incluir al propio usuario en la lista ni describirlo a sí mismo.
  const _yo = (usuario.email || '').toLowerCase().trim();
  const _esYo = (em) => { const x = String(em || '').toLowerCase().trim(); return !!x && !!_yo && x === _yo; };
  const attendees = (e.attendees || []).filter(a => a && !_esYo(a));
  const asistentes = attendees.slice(0, 6).join(', ');
  let txt = `⏰ *En ${MINUTOS_ANTES}min*: ${e.summary} (${hm})${lugar}`;
  if (asistentes) txt += `\nCon: ${asistentes}`;
  // Contexto de los asistentes (2026-06-10): si el attendee está en la libreta
  // del usuario, anexar 1 línea de su nota curada (memoria de largo plazo) o,
  // si no hay, las notas de libreta. Máx 2 asistentes para no inflar el aviso.
  try {
    let agregadas = 0;
    for (const em of attendees) {
      if (agregadas >= 2) break;
      const c = mem.buscarContacto({ usuarioId: usuario.id, email: String(em).trim().toLowerCase() });
      const nombre = c ? c.nombre : (_nombreDesdeEmail(em) || em);
      const nota = c ? mem.getNotaContacto(usuario.id, c.id) : null;
      const fuente = (nota && nota.nota) ? nota.nota : (c && c.notas) || null;
      // Enriquecimiento web (rol/empresa) por asistente.
      const web = await _enriquecerAsistente({ email: em, nombre: c ? c.nombre : null, usuario });
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
    loopGuard.reportar('acceso_google', true);
  } catch (err) {
    console.warn(`[meeting-prep/${usuario.nombre}] listar cal falló:`, err.message);
    if (loopGuard.esErrorAccesoGoogle(err)) loopGuard.reportar('acceso_google', false, err);
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
