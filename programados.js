// programados.js — loop que despacha mensajes programados cuando llega su hora
//
// Cada N segundos (default 60s) escanea la tabla `programados` buscando
// registros con enviado=0 y cuando<=ahora, y los envía por el canal que
// corresponda (WA o Gmail). Al enviarse los marca como enviado=1. Si falla,
// deja enviado=0 pero loguea a memory (reintenta en el próximo ciclo).
//
// Multi-user: no filtramos por usuario — procesamos todos los debidos. El
// destino de cada programado es explícito (wa_cus / wa_lid / email). Para
// WA resolvemos el destino a @lid si el destino coincide con algún usuario
// registrado.

const mem = require('./memory');
const g   = require('./google');
const usuarios = require('./usuarios');
const waSend = require('./wa-send');

// El envío WA se delega a wa-send.enviarWADirecto, que centraliza la
// resolución @c.us↔@lid y el catch+fallback. No logueamos saliente desde
// el helper porque acá ya logueamos con metadata específica de
// `programados` (programadoId, razon, etc.) después de marcar enviado.
async function _enviarWA(waClient, prog) {
  if (!waClient) throw new Error('waClient no disponible');
  const { destinoFinal } = await waSend.enviarWADirecto(waClient, prog.destino, prog.texto, {
    tag: `programados/${prog.id}`,
    logSaliente: false,
    usuarioId: prog.usuario_id || null,
  });
  return destinoFinal;
}

async function _enviarGmail(prog) {
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
      usuarioId: prog.usuario_id || null,
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
      usuarioId: prog.usuario_id || null,
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
