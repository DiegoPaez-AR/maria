// cumple-avisos.js — aviso proactivo la NOCHE ANTERIOR a un cumpleaños.
//
// Cada tick (15min default), por usuario activo: si es la ventana de la noche
// (20-23h en su tz) y todavía no se chequeó hoy, busca cumpleañeros de MAÑANA
// en su libreta visible (privados + públicos, igual que la sección de cumples
// del brief) y le manda UN WhatsApp ofreciendo mandar el saludo. El usuario
// responde en lenguaje natural y Maria resuelve con enviar_wa normal (el
// contacto entra al prompt por la regla de relevancia: está nombrado).
//
// Dedup: estado_usuario['cumple_aviso_ultimo_dia'] = YYYY-MM-DD local. Se
// marca ANTES de enviar y aunque no haya cumpleañeros (el chequeo del día ya
// se hizo) — un crash mid-send pierde a lo sumo un aviso, nunca duplica.

const mem = require('./memory');
const usuarios = require('./usuarios');
const waSend = require('./wa-send');
const i18n = require('./i18n');

const HORA      = Number(process.env.CUMPLE_AVISO_HORA || 20);
const VENTANA_H = Number(process.env.CUMPLE_AVISO_VENTANA_H || 3);
const ESTADO_KEY = 'cumple_aviso_ultimo_dia';

function _enTz(tz) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz || 'America/Argentina/Buenos_Aires',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const g = (t) => parts.find(p => p.type === t)?.value;
  return {
    yyyymmdd: `${g('year')}-${g('month')}-${g('day')}`,
    hora: Number(g('hour')),
    year: Number(g('year')), mes: Number(g('month')), dia: Number(g('day')),
  };
}

function _maniana(t) {
  const d = new Date(Date.UTC(t.year, t.mes - 1, t.dia));
  d.setUTCDate(d.getUTCDate() + 1);
  return { mes: d.getUTCMonth() + 1, dia: d.getUTCDate() };
}

async function tickUsuario(waClient, usuario) {
  const tz = usuario.tz || 'America/Argentina/Buenos_Aires';
  const t = _enTz(tz);
  if (t.hora < HORA || t.hora >= HORA + VENTANA_H) return;
  if (mem.getEstadoUsuario(usuario.id, ESTADO_KEY) === t.yyyymmdd) return;

  // Marcar ANTES: el chequeo de hoy queda hecho aunque no haya cumpleañeros
  // o falle el envío (preferimos perder un aviso a duplicarlo).
  mem.setEstadoUsuario(usuario.id, ESTADO_KEY, t.yyyymmdd);

  const m = _maniana(t);
  let cumpleaneros = [];
  try {
    cumpleaneros = mem.cumpleañerosDelDia({ usuarioId: usuario.id, mes: m.mes, dia: m.dia });
  } catch (err) {
    console.warn(`[cumple-avisos/${usuario.nombre}] lookup falló:`, err.message);
    return;
  }
  if (!cumpleaneros.length) return;
  if (!usuario.wa_lid && !usuario.wa_cus) return;
  if (!waClient) return;

  const TT = i18n.T(usuario.idioma);
  const lineas = cumpleaneros.slice(0, 5).map(c =>
    `• ${c.nombre}${c.whatsapp ? '' : TT.sinWaLibreta}`);
  const plural = cumpleaneros.length > 1;
  const txt = `${TT.cumpleEnc(plural)}\n${lineas.join('\n')}\n\n${TT.cumpleCierre(plural)}`;

  try {
    await waSend.enviarWAUsuario(waClient, usuario, txt, {
      tag: `cumple-avisos/${usuario.nombre}`,
      metadata: { tipo: 'cumple_aviso', cumpleaneros: cumpleaneros.map(c => c.nombre) },
    });
    console.log(`[cumple-avisos/${usuario.nombre}] ✓ aviso de ${cumpleaneros.length} cumple(s) de mañana`);
  } catch (err) {
    console.error(`[cumple-avisos/${usuario.nombre}] enviar falló:`, err.message);
  }
}

async function tick(waClient) {
  for (const u of usuarios.listarServidos()) {
    try { await tickUsuario(waClient, u); }
    catch (err) { console.error(`[cumple-avisos/${u.nombre}] tick:`, err.message); }
  }
}

function iniciarCumpleAvisos({ waClient, intervaloMs = 15 * 60_000 } = {}) {
  console.log(`[cumple-avisos] activo, ventana ${HORA}-${HORA + VENTANA_H}h tz usuario`);
  return setInterval(() => {
    tick(waClient).catch(err => console.error('[cumple-avisos] tick:', err));
  }, intervaloMs);
}

module.exports = { iniciarCumpleAvisos, tick };
