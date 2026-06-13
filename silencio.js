// silencio.js — "horas de silencio" para envíos WA proactivos.
//
// Diego (2026-06-13): salvo el daily brief y lo que el usuario pide en vivo,
// Maria no manda WhatsApp entre las 0 y las 8, en hora local de CADA usuario.
// Los emisores autónomos que pingan de madrugada (recordatorios, follow-ups y
// las notificaciones que dispara un mail entrante vía gmail-handler→enviar_wa)
// marcan sus envíos como `diferible`. Si caen en la franja, wa-send los encola
// en `wa_diferidos` en vez de mandarlos; el drainer (diferidos-drainer.js) los
// larga a las 8 hora local de cada usuario. Nada se pierde.
//
// NO afecta: respuestas en vivo (sendMessage crudo en whatsapp-handler), el
// morning-brief (exento), programados (los agenda el usuario), maria-worker
// (ya corre 08-22) ni las alertas operativas (loop-guard, programado que falla,
// moderación, escalado a owner): todas pasan siempre.
//
// Tuning por env: MARIA_SILENCIO_DESDE (default 0), MARIA_SILENCIO_HASTA
// (default 8). Si DESDE==HASTA → silencio desactivado.

const DESDE = Number(process.env.MARIA_SILENCIO_DESDE || 0);  // hora inclusive
const HASTA = Number(process.env.MARIA_SILENCIO_HASTA || 8);  // hora exclusive
const TZ_DEFAULT = process.env.MARIA_TZ || 'America/Argentina/Buenos_Aires';

function _horaEnTz(tz, date = new Date()) {
  try {
    return Number(new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit', hour12: false, timeZone: tz || TZ_DEFAULT,
    }).format(date));
  } catch {
    return date.getHours();
  }
}

// ¿Estamos en la franja de silencio en la tz dada?
function enSilencio(tz, date = new Date()) {
  if (DESDE === HASTA) return false;
  const h = _horaEnTz(tz, date);
  if (DESDE < HASTA) return h >= DESDE && h < HASTA;   // ventana normal (ej. 0-8)
  return h >= DESDE || h < HASTA;                       // ventana que cruza medianoche (ej. 22-6)
}

module.exports = { enSilencio, DESDE, HASTA };
