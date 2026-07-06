// resumen-semanal.js — balance de la semana por usuario, los domingos a la
// tarde-noche (ventana 19-22h en la tz de cada usuario).
//
// Template puro (sin claude_call — costo cero): cuenta mensajes, emails,
// eventos agendados, pendientes y follow-ups de los últimos 7 días desde la
// DB, más los primeros pendientes abiertos. Si la semana fue toda ceros, no
// manda nada (usuario inactivo = silencio, no spam).
//
// Dedup: estado_usuario['resumen_semanal_ultimo'] = YYYY-MM-DD local.

const mem = require('./memory');
const usuarios = require('./usuarios');
const waSend = require('./wa-send');
const i18n = require('./i18n');

const DIA       = Number(process.env.RESUMEN_SEMANAL_DIA || 0);   // 0=domingo
const HORA      = Number(process.env.RESUMEN_SEMANAL_HORA || 19);
const VENTANA_H = Number(process.env.RESUMEN_SEMANAL_VENTANA_H || 3);
const ESTADO_KEY = 'resumen_semanal_ultimo';

function _enTz(tz) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz || 'America/Argentina/Buenos_Aires',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hour12: false, weekday: 'short',
  }).formatToParts(new Date());
  const g = (t) => parts.find(p => p.type === t)?.value;
  const DOW = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    yyyymmdd: `${g('year')}-${g('month')}-${g('day')}`,
    hora: Number(g('hour')),
    dow: DOW[g('weekday')] ?? new Date().getDay(),
    dia: Number(g('day')), mes: Number(g('month')),
  };
}

function _componer(usuario, t) {
  const s = mem.statsSemana(usuario.id);
  const total = s.waIn + s.waOut + s.mailIn + s.mailOut + s.eventosCreados
              + s.pendCerrados + s.pendNuevos + s.fuCerrados + s.fuDisparados;
  if (!total) return null;

  const TT = i18n.T(usuario.idioma);
  const dd = String(t.dia).padStart(2, '0'), mm = String(t.mes).padStart(2, '0');
  const lineas = [TT.tuSemana(dd, mm)];
  if (s.waIn + s.waOut)     lineas.push(TT.waLine(s.waIn, s.waOut));
  if (s.mailIn + s.mailOut) lineas.push(TT.mailLine(s.mailIn, s.mailOut));
  if (s.eventosCreados)     lineas.push(TT.eventosLine(s.eventosCreados));
  lineas.push(TT.pendLine(s.pendCerrados, s.pendNuevos, s.pendAbiertos));
  if (s.fuCerrados + s.fuDisparados) lineas.push(TT.fuLine(s.fuCerrados, s.fuDisparados));

  // Top pendientes abiertos del usuario (dueno=usuario), para arrancar la semana
  try {
    const abiertos = mem.listarPendientes(usuario.id)
      .filter(p => p.dueno === 'usuario')
      .slice(0, 3)
      .map(p => `• ${String(p.desc).slice(0, 80)}`);
    if (abiertos.length) {
      lineas.push('');
      lineas.push(TT.arrancas);
      lineas.push(...abiertos);
    }
  } catch {}

  return lineas.join('\n');
}

async function tickUsuario(waClient, usuario) {
  const t = _enTz(usuario.tz);
  if (t.dow !== DIA) return;
  if (t.hora < HORA || t.hora >= HORA + VENTANA_H) return;
  if (mem.getEstadoUsuario(usuario.id, ESTADO_KEY) === t.yyyymmdd) return;
  if (!usuario.wa_lid && !usuario.wa_cus) return;
  // guard !waClient eliminado 2026-07-06 — fallback TG→email en wa-send

  mem.setEstadoUsuario(usuario.id, ESTADO_KEY, t.yyyymmdd); // marcar antes (no duplicar)

  const texto = _componer(usuario, t);
  if (!texto) return; // semana sin actividad → silencio

  try {
    await waSend.enviarWAUsuario(waClient, usuario, texto, {
      tag: `resumen-semanal/${usuario.nombre}`,
      metadata: { tipo: 'resumen_semanal' },
    });
    console.log(`[resumen-semanal/${usuario.nombre}] ✓ enviado`);
  } catch (err) {
    console.error(`[resumen-semanal/${usuario.nombre}] enviar falló:`, err.message);
  }
}

async function tick(waClient) {
  for (const u of usuarios.listarServidos()) {
    try { await tickUsuario(waClient, u); }
    catch (err) { console.error(`[resumen-semanal/${u.nombre}] tick:`, err.message); }
  }
}

function iniciarResumenSemanal({ waClient, intervaloMs = 15 * 60_000 } = {}) {
  console.log(`[resumen-semanal] activo, día ${DIA} (0=dom) ${HORA}-${HORA + VENTANA_H}h tz usuario`);
  return setInterval(() => {
    tick(waClient).catch(err => console.error('[resumen-semanal] tick:', err));
  }, intervaloMs);
}

module.exports = { iniciarResumenSemanal, tick };
