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
//
// Fallos repetidos: si un programado falla 2+ veces consecutivas con el
// MISMO error (matched por primeros 120 chars de err.message), notificamos
// al owner por WA y pausamos el programado (enviado=-2) para no spamear.
// El owner puede destrabarlo via 'cancelar_programado' o re-crear con el
// destino corregido. Estados: 0=pendiente, 1=enviado, -1=cancelado, -2=pausado.

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

    // Tracking de intentos: si el MISMO error se repite, incrementamos. Si es
    // un error distinto al anterior, reseteamos el contador (otra causa).
    const errKey = String(err.message || '').slice(0, 120);
    const metaActual = prog.metadata || {};
    const prevFallos = metaActual.fallos || {};
    const intentos = (prevFallos.errorKey === errKey) ? (prevFallos.count || 0) + 1 : 1;
    try {
      mem.actualizarMetadataProgramado(prog.id, {
        fallos: { count: intentos, errorKey, ultimo_ts: new Date().toISOString() },
      });
    } catch (mErr) {
      console.warn(`[programados] no pude persistir metadata de fallo para id=${prog.id}:`, mErr.message);
    }

    mem.log({
      usuarioId: prog.usuario_id || null,
      canal: 'sistema', direccion: 'interno',
      cuerpo: `programado id=${prog.id} falló (intento #${intentos}): ${err.message}`,
      metadata: { programadoId: prog.id, canal: prog.canal, destino: prog.destino, razon: prog.razon, intentos },
    });

    // Umbral: a partir del 2do fallo consecutivo con la MISMA causa, notificar
    // al owner y pausar el programado para no spamear el log.
    if (intentos >= 2) {
      try {
        const owner = usuarios.obtenerOwner();
        const dest = owner && (owner.wa_lid || owner.wa_cus);
        if (dest && waClient) {
          const previewTexto = (prog.texto || '').slice(0, 140) + ((prog.texto || '').length > 140 ? '…' : '');
          const aviso = [
            `⚠️ Tu programado #${prog.id} falla repetidamente (${intentos} intentos).`,
            ``,
            `Canal: ${prog.canal}`,
            `Destino: ${prog.destino}`,
            `Mensaje: "${previewTexto}"`,
            `Error: ${err.message.slice(0, 200)}`,
            ``,
            `Lo pausé para no seguir intentando. Para retomarlo decime "cancelá el programado ${prog.id}" o pasame el destino correcto y lo re-armo.`,
          ].join('\n');
          await waSend.enviarWADirecto(waClient, dest, aviso, {
            tag: `programados/${prog.id}/fallo-repetido`,
            logSaliente: true,
            usuarioId: owner.id,
          });
          mem.pausarProgramado(prog.id);
          console.log(`[programados] ⚠ id=${prog.id} pausado tras ${intentos} fallos consecutivos — owner notificado`);
        } else {
          console.warn(`[programados] no pude notificar owner sobre id=${prog.id}: owner sin WA o waClient no disponible`);
        }
      } catch (notifErr) {
        console.error(`[programados] notificación al owner falló para id=${prog.id}:`, notifErr.message);
      }
    }

    if (waClient && waClient._watchdogFrameMuerto) {
      waClient._watchdogFrameMuerto(err, `programados id=${prog.id}`);
    }
    // Si NO se pausó (intentos < 2), queda enviado=0 y reintenta en el próximo ciclo.
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
