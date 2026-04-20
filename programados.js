// programados.js — loop que despacha mensajes programados cuando llega su hora
//
// Cada N segundos (default 60s) escanea la tabla `programados` buscando registros
// con enviado=0 y cuando<=ahora, y los envía por el canal que corresponda (WA o Gmail).
// Al enviarse los marca como enviado=1. Si falla, deja enviado=0 pero loguea a memory
// (reintenta en el próximo ciclo — útil si WA Web aún no está ready o el token de
// Google está renovándose).
//
// Uso:
//   const { iniciarProgramados } = require('./programados');
//   const interval = iniciarProgramados({ waClient, intervaloMs: 60000 });
//   // luego: clearInterval(interval)

const mem = require('./memory');
const g   = require('./google');

const DIEGO_WA_CUS = process.env.DIEGO_WA || '541132317896@c.us';

function _esDiego(dest) {
  const soloDig = String(dest || '').replace(/\D/g, '');
  const diegoDig = DIEGO_WA_CUS.replace(/\D/g, '');
  return soloDig === diegoDig && soloDig.length > 0;
}

async function _enviarWA(waClient, prog) {
  if (!waClient) throw new Error('waClient no disponible');

  // Si apunta al @c.us legacy de Diego, resolver al @lid capturado.
  let destino = prog.destino;
  const apuntaADiego = _esDiego(destino);
  if (apuntaADiego) {
    const lid = mem.getEstado('diego_wa_lid');
    if (lid) destino = lid;
  }

  try {
    await waClient.sendMessage(destino, prog.texto);
    return destino;
  } catch (err) {
    const esLidError = /No LID for user|invalid wid|not.{0,10}registered/i.test(err.message || '');
    if (esLidError && apuntaADiego) {
      const lid = mem.getEstado('diego_wa_lid');
      if (lid && lid !== destino) {
        await waClient.sendMessage(lid, prog.texto);
        return lid;
      }
    }
    throw err;
  }
}

async function _enviarGmail(prog) {
  // Gmail "directo" — sin inReplyTo. Usamos enviarEmail si existe, sino fallback.
  if (typeof g.enviarEmail === 'function') {
    await g.enviarEmail({
      to: prog.destino,
      asunto: prog.asunto || '(sin asunto)',
      texto: prog.texto,
    });
  } else {
    throw new Error('google.enviarEmail no está implementado — usá canal whatsapp por ahora');
  }
}

async function procesarUno(waClient, prog) {
  try {
    let destinoFinal = prog.destino;
    if (prog.canal === 'whatsapp') {
      destinoFinal = await _enviarWA(waClient, prog);
    } else if (prog.canal === 'gmail') {
      await _enviarGmail(prog);
    } else {
      throw new Error(`canal inválido: ${prog.canal}`);
    }

    mem.marcarProgramadoEnviado(prog.id);
    mem.log({
      canal: prog.canal, direccion: 'saliente',
      de: destinoFinal, asunto: prog.asunto || null, cuerpo: prog.texto,
      metadata: {
        programadoId: prog.id,
        razon: prog.razon,
        destinoOriginal: prog.destino,
        destinoFinal,
      },
    });
    console.log(`[programados] ✓ id=${prog.id} (${prog.canal}/${destinoFinal}) [${prog.razon || 'sin-razon'}]`);
  } catch (err) {
    console.error(`[programados] ✗ id=${prog.id} falló:`, err.message);
    mem.log({
      canal: 'sistema', direccion: 'interno',
      cuerpo: `programado id=${prog.id} falló: ${err.message}`,
      metadata: { programadoId: prog.id, canal: prog.canal, destino: prog.destino, razon: prog.razon },
    });
    if (waClient && waClient._watchdogFrameMuerto) {
      waClient._watchdogFrameMuerto(err, `programados id=${prog.id}`);
    }
    // NO lo marcamos como enviado — reintenta en el próximo ciclo.
  }
}

async function tick(waClient) {
  const debidos = mem.programadosDebidos(new Date());
  if (!debidos.length) return;
  console.log(`[programados] ${debidos.length} mensaje(s) debidos, despachando…`);
  for (const p of debidos) {
    await procesarUno(waClient, p);
  }
}

function iniciarProgramados({ waClient, intervaloMs = 60_000 } = {}) {
  // Primer tick inmediato (por si hubo downtime con mensajes acumulados)
  tick(waClient).catch(err => console.error('[programados] tick inicial:', err));
  return setInterval(() => {
    tick(waClient).catch(err => console.error('[programados] tick:', err));
  }, intervaloMs);
}

module.exports = { iniciarProgramados, tick };
