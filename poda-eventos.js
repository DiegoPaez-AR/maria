// poda-eventos.js — mantenimiento diario de la tabla eventos (2026-06-11).
//
// Política (acordada con Diego):
//   - telemetría (claude_call) > 60 días → SE BORRA
//   - todo lo demás > 18 meses → se MUEVE a eventos_archivo (recuperable;
//     a esa edad memoria-curada ya lo sintetizó hace rato)
// Corre al boot (+5 min) y después cada 24h, en lotes de 5000 para no
// bloquear la DB. Implementación de las queries en memory.podarEventos.

const mem = require('./memory');

const TELEMETRIA_DIAS = Number(process.env.PODA_TELEMETRIA_DIAS || 60);
const ARCHIVO_DIAS    = Number(process.env.PODA_ARCHIVO_DIAS || 540);
const BATCH           = Number(process.env.PODA_BATCH || 5000);

function tick() {
  try {
    const r = mem.podarEventos({ telemetriaDias: TELEMETRIA_DIAS, archivoDias: ARCHIVO_DIAS, batch: BATCH });
    if (r.telemetriaBorrada || r.archivados) {
      console.log(`[poda-eventos] telemetría borrada: ${r.telemetriaBorrada} · archivados: ${r.archivados}`);
      mem.log({
        canal: 'sistema', direccion: 'interno',
        cuerpo: `poda-eventos: ${r.telemetriaBorrada} telemetría borrada (>${TELEMETRIA_DIAS}d), ${r.archivados} archivados (>${ARCHIVO_DIAS}d)`,
        metadata: { tipo: 'poda_eventos', ...r },
      });
    }
  } catch (err) {
    console.error('[poda-eventos] tick:', err.message);
  }
}

function iniciarPodaEventos({ intervaloMs = 24 * 60 * 60_000 } = {}) {
  console.log(`[poda-eventos] activo: telemetría >${TELEMETRIA_DIAS}d se borra, resto >${ARCHIVO_DIAS}d a eventos_archivo`);
  setTimeout(tick, 5 * 60_000).unref();
  return setInterval(tick, intervaloMs);
}

module.exports = { iniciarPodaEventos, tick };
