// diferidos-drainer.js — larga los envíos WA que quedaron en cola durante las
// horas de silencio (ver silencio.js / wa-send.js). Cada tick recorre
// wa_diferidos pendientes y manda los de usuarios que YA salieron de la franja
// (enSilencio(tz)===false). Los que siguen en silencio quedan para el próximo
// tick. Default cada 5min — el primer tick pasadas las 8:00 los larga.

const mem = require('./memory');
const silencio = require('./silencio');
const waSend = require('./wa-send');
const usuarios = require('./usuarios');

async function tick(waClient) {
  // Ya NO exige waClient (2026-07-07): los diferidos de usuarios pueden salir
  // por TG-first / fallback email aunque WA esté caído o apagado.
  let pendientes;
  try {
    pendientes = mem.diferidosPendientes();
  } catch (e) {
    console.error('[diferidos] leer cola falló:', e.message);
    return;
  }
  if (!pendientes.length) return;

  for (const d of pendientes) {
    if (silencio.enSilencio(d.tz)) continue; // todavía de noche para este usuario
    const u = d.usuario_id ? usuarios.obtener(d.usuario_id) : null;
    try {
      // diferible:false explícito → se manda ya (no re-encola).
      if (u) {
        // Usuario conocido → enviarWAUsuario (TG-first + fallback email).
        await waSend.enviarWAUsuario(waClient, u, d.texto, {
          tag: `${d.tag || 'diferido'}+drenado`,
          diferible: false,
          metadata: { ...(d.metadata || {}), drenadoDe: d.id, diferido: true },
        });
      } else {
        if (!waClient) continue; // destino crudo necesita WA — próximo tick
        await waSend.enviarWADirecto(waClient, d.destino, d.texto, {
          tag: `${d.tag || 'diferido'}+drenado`,
          usuarioId: d.usuario_id || null,
          diferible: false,
          metadata: { ...(d.metadata || {}), drenadoDe: d.id, diferido: true },
        });
      }
      mem.marcarDiferidoEnviado(d.id);
      console.log(`[diferidos] ✓ #${d.id} drenado → ${u ? u.nombre : d.destino} (${d.tag || 'sin-tag'})`);
    } catch (err) {
      console.error(`[diferidos] ✗ #${d.id} falló: ${err.message} — reintenta próximo tick`);
      // No marcar: reintenta en el próximo tick.
    }
  }
}

function iniciarDiferidosDrainer({ waClient, intervaloMs = 5 * 60_000 } = {}) {
  console.log(`[diferidos] drainer activo (cada ${intervaloMs / 60_000}min)`);
  // Tick inicial: por si el proceso arranca de día con cosas encoladas anoche.
  tick(waClient).catch(err => console.error('[diferidos] tick inicial:', err.message));
  return setInterval(() => {
    tick(waClient).catch(err => console.error('[diferidos] tick:', err.message));
  }, intervaloMs);
}

module.exports = { iniciarDiferidosDrainer, tick };
