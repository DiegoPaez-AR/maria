// usuarios-dormidos.js — pausa mensual de usuarios que no interactúan.
//
// REGLA (decisión Diego, 2026-08-23): el 1º de cada mes Maria mira quién no le
// escribió en los últimos 30 días. A esos les manda un mail avisando que los
// pone en pausa y que les corta el brief; si quieren retomar, le escriben por
// cualquiera de sus canales.
//
// POR QUÉ: al 23/8, con 16 usuarios, Maria mandaba ~1000 mensajes/mes a gente
// que no le contestaba nada — a cuatro de ellos les había mandado 37 briefs
// cada uno sin haber recibido jamás una palabra. Eso quema reputación de envío
// (que costó arreglar en junio), gasta plata y no le sirve a nadie.
//
// Cómo se despierta: CUALQUIER mensaje del usuario lo reactiva
// (usuarios.registrarActividad, lo llaman los tres handlers). No hace falta una
// frase exacta: pedir un "quiero retomar" textual sería una forma más de fallar.

const fs = require('fs');
const path = require('path');
const mem = require('./memory');
const usuarios = require('./usuarios');
const google = require('./google');
const waSend = require('./wa-send');

const DIAS_SIN_ACTIVIDAD = Number(process.env.MARIA_DORMIDO_DIAS || 30);
const _stateDir = path.dirname(path.dirname(process.env.MARIA_DB || './db/x'));
const MARKER = path.join(_stateDir, 'dormidos-ultima-revision');

const ASISTENTE = process.env.ASISTENTE_NOMBRE || 'Maria';
const FROM = process.env.ASISTENTE_FROM_EMAIL || process.env.MARIA_FROM_EMAIL || '';

/** Fecha del último mensaje ENTRANTE del usuario (ISO) o null si nunca escribió. */
function _ultimaActividad(usuarioId) {
  try {
    const r = mem.db.prepare(
      `SELECT MAX(timestamp) t FROM eventos
        WHERE usuario_id = ? AND direccion = 'entrante'
          AND canal IN ('whatsapp','telegram','gmail')`
    ).get(usuarioId);
    return (r && r.t) || null;
  } catch { return null; }
}

function _diasDesde(iso) {
  if (!iso) return null;
  const t = Date.parse(String(iso).replace(' ', 'T') + 'Z');
  if (!Number.isFinite(t)) return null;
  return Math.floor((Date.now() - t) / 86400000);
}

/** Usuarios servidos que no interactúan hace DIAS_SIN_ACTIVIDAD o más. */
function dormidos() {
  const out = [];
  for (const u of usuarios.listarServidos()) {
    if (u.rol === 'owner') continue;             // al owner no se lo pausa nunca
    const ult = _ultimaActividad(u.id);
    // Nunca escribió: cuenta desde el alta (si es reciente, todavía no aplica).
    const ref = ult || u.creado;
    const dias = _diasDesde(ref);
    if (dias == null || dias < DIAS_SIN_ACTIVIDAD) continue;
    out.push({ usuario: u, ultima: ult, dias, nuncaEscribio: !ult });
  }
  return out;
}

function _textoPausa(u) {
  const en = u.idioma === 'en';
  if (en) return {
    asunto: `Pausing your daily briefs`,
    texto:
`Hi ${u.nombre},

I noticed we haven't talked in a while, so I'm pausing your daily briefs — no point filling your inbox with something you're not using.

Nothing is lost: I keep your calendar, your contacts and everything we set up. Whenever you want to pick it up again, just write to me on any of my channels and I'll turn everything back on.

${ASISTENTE}`,
  };
  return {
    asunto: `Te pongo en pausa los mensajes diarios`,
    texto:
`Hola ${u.nombre},

Vi que hace un tiempo que no hablamos, así que te pongo en pausa el brief diario — no tiene sentido llenarte la casilla con algo que no estás usando.

No se pierde nada: sigo teniendo tu agenda, tus contactos y todo lo que habíamos configurado. Cuando quieras retomar, escribime por cualquiera de mis canales y lo reactivo al toque.

${ASISTENTE}`,
  };
}

/**
 * Corre la revisión. `dryRun: true` no pausa ni manda nada — solo devuelve la
 * lista (para mirarla antes de que se ejecute sola).
 */
async function revisar({ dryRun = false } = {}) {
  const lista = dormidos();
  if (!lista.length) {
    console.log('[dormidos] ninguno para pausar');
    return { pausados: [], dryRun };
  }
  const hechos = [];
  for (const d of lista) {
    const u = d.usuario;
    if (dryRun) { hechos.push({ nombre: u.nombre, dias: d.dias, email: u.email, nuncaEscribio: d.nuncaEscribio }); continue; }
    try {
      if (u.email) {
        const { asunto, texto } = _textoPausa(u);
        await google.enviarEmail({ to: u.email, asunto, texto });
      } else {
        console.warn(`[dormidos] ${u.nombre} no tiene email — lo pauso igual, sin aviso`);
      }
      usuarios.pausar(u.id);
      mem.log({
        usuarioId: u.id, canal: 'sistema', direccion: 'interno',
        cuerpo: `usuario PAUSADO por inactividad (${d.dias} días${d.nuncaEscribio ? ', nunca escribió' : ''}) — aviso enviado a ${u.email || '(sin email)'}`,
        metadata: { tipo: 'usuario_pausado', dias: d.dias, nunca_escribio: d.nuncaEscribio },
      });
      hechos.push({ nombre: u.nombre, dias: d.dias, email: u.email, nuncaEscribio: d.nuncaEscribio });
      console.log(`[dormidos] ${u.nombre} pausado (${d.dias} días sin escribir)`);
      await new Promise(r => setTimeout(r, 4000));   // cadencia, no ráfaga
    } catch (err) {
      console.error(`[dormidos] ${u.nombre} falló:`, err.message);
    }
  }

  // El owner tiene que ver a quién se pausó — es una decisión de negocio, no
  // un detalle técnico.
  if (!dryRun && hechos.length) {
    try {
      const owner = usuarios.obtenerOwner();
      if (owner) {
        const detalle = hechos
          .map(h => `· ${h.nombre} — ${h.dias} días${h.nuncaEscribio ? ' (nunca escribió)' : ''}`)
          .join('\n');
        await waSend.enviarWAUsuario(null, owner,
          `🔕 Revisión mensual: puse en pausa a ${hechos.length} usuario(s) que no interactúan hace ${DIAS_SIN_ACTIVIDAD}+ días.\n\n${detalle}\n\nDejan de recibir brief y avisos automáticos. Si escriben, se reactivan solos.`,
          { tag: 'dormidos/resumen', metadata: { tipo: 'dormidos_resumen', n: hechos.length } });
      }
    } catch (e) { console.warn('[dormidos] no pude avisar al owner:', e.message); }
  }
  return { pausados: hechos, dryRun };
}

/** ¿Ya corrimos la revisión de este mes? */
function _yaCorrioEsteMes() {
  try {
    const v = fs.readFileSync(MARKER, 'utf8').trim();
    return v === new Date().toISOString().slice(0, 7);   // "YYYY-MM"
  } catch { return false; }
}
function _marcarCorrido() {
  try { fs.writeFileSync(MARKER, new Date().toISOString().slice(0, 7)); } catch { /* noop */ }
}

async function tick() {
  const hoy = new Date();
  if (hoy.getUTCDate() !== 1) return;      // sólo el 1º
  if (_yaCorrioEsteMes()) return;
  _marcarCorrido();                        // marcamos ANTES: si falla, no se repite en loop
  console.log('[dormidos] revisión mensual — buscando usuarios sin interacción');
  await revisar({ dryRun: false });
}

function iniciarDormidos({ intervaloMs = 6 * 3600 * 1000 } = {}) {
  console.log(`[dormidos] activo (revisión el 1º de cada mes, umbral ${DIAS_SIN_ACTIVIDAD} días)`);
  tick().catch(e => console.error('[dormidos] tick inicial:', e.message));
  return setInterval(() => tick().catch(e => console.error('[dormidos] tick:', e.message)), intervaloMs);
}

module.exports = { iniciarDormidos, revisar, dormidos, tick };
