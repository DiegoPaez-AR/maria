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
// destino corregido.
// Estados: 0=pendiente, 1=enviado, 2=en vuelo (claim), -1=cancelado, -2=pausado.
//
// Doble-envío (fix 2026-06-09): antes de despachar, cada programado se
// "reclama" con un UPDATE atómico 0→2. Si dos ticks se solapan (un tick
// lento >60s por frame muerto de WA / red), el segundo no puede reclamar y
// saltea. Si el proceso muere mid-envío, el claim huérfano (2) se resetea
// a 0 al próximo arranque (posible re-envío — preferimos at-least-once a
// perder el mensaje).

const mem = require('./memory');
const g   = require('./google');
const usuarios = require('./usuarios');
const waSend = require('./wa-send');

// El envío WA se delega a wa-send.enviarWADirecto, que centraliza la
// resolución @c.us↔@lid y el catch+fallback. No logueamos saliente desde
// el helper porque acá ya logueamos con metadata específica de
// `programados` (programadoId, razon, etc.) después de marcar enviado.
async function _enviarWA(waClient, prog) {
  // Automáticos sin WA (política 2026-07-07 v2): si el destino es el PROPIO
  // usuario del programado, delegamos en enviarWAUsuario (TG → email → WA
  // último recurso). Si el destino es OTRA persona, sigue por WA directo
  // (delegar mandaría el mensaje al usuario equivocado).
  const u = prog.usuario_id ? usuarios.obtener(prog.usuario_id) : null;
  const esElUsuario = u && (prog.destino === u.wa_lid || prog.destino === u.wa_cus);
  if (esElUsuario) {
    const r = await waSend.enviarWAUsuario(waClient, u, prog.texto, {
      tag: `programados/${prog.id}`,
      logSaliente: false,
    });
    return { destinoFinal: r.destinoFinal, canal: r.canal || 'whatsapp' };
  }
  if (!waClient) throw new Error('waClient no disponible');
  const { destinoFinal } = await waSend.enviarWADirecto(waClient, prog.destino, prog.texto, {
    tag: `programados/${prog.id}`,
    logSaliente: false,
    usuarioId: prog.usuario_id || null,
  });
  return { destinoFinal, canal: 'whatsapp' };
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
  // Claim atómico: solo despacha quien logre el UPDATE 0→2. Evita doble
  // envío con ticks solapados o re-lecturas de la misma tanda.
  if (!mem.claimProgramado(prog.id)) {
    console.log(`[programados] id=${prog.id} ya reclamado/resuelto por otro tick — salteo`);
    return;
  }
  try {
    let destinoFinal = prog.destino;
    let canalFinal = prog.canal;
    if (prog.canal === 'whatsapp') {
      const r = await _enviarWA(waClient, prog);
      destinoFinal = r.destinoFinal;
      canalFinal = r.canal;
    } else if (prog.canal === 'gmail') {
      await _enviarGmail(prog);
    } else {
      throw new Error(`canal inválido: ${prog.canal}`);
    }

    mem.marcarProgramadoEnviado(prog.id);
    mem.log({
      usuarioId: prog.usuario_id || null,
      canal: canalFinal, direccion: 'saliente',
      de: destinoFinal, asunto: prog.asunto || null, cuerpo: prog.texto,
      metadata: {
        programadoId: prog.id,
        razon: prog.razon,
        destinoOriginal: prog.destino,
        destinoFinal,
      },
    });
    console.log(`[programados] ✓ id=${prog.id} (${canalFinal}/${destinoFinal}) [${prog.razon || 'sin-razon'}]`);
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
        fallos: { count: intentos, errorKey: errKey, ultimo_ts: new Date().toISOString() },
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
        if (owner) {
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
          await waSend.enviarWAUsuario(waClient, owner, aviso, {
            tag: `programados/${prog.id}/fallo-repetido`,
            logSaliente: true,
          });
          mem.pausarProgramado(prog.id);
          console.log(`[programados] ⚠ id=${prog.id} pausado tras ${intentos} fallos consecutivos — owner notificado`);
        } else {
          console.warn(`[programados] no pude notificar owner sobre id=${prog.id}: no hay owner`);
        }
      } catch (notifErr) {
        console.error(`[programados] notificación al owner falló para id=${prog.id}:`, notifErr.message);
      }
    }

    if (waClient && waClient._watchdogFrameMuerto) {
      waClient._watchdogFrameMuerto(err, `programados id=${prog.id}`);
    }
    // Liberar el claim (2→0) para que reintente en el próximo ciclo. Si se
    // pausó arriba (enviado=-2), este UPDATE es no-op.
    mem.liberarProgramado(prog.id);
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
  // Recovery: claims huérfanos (enviado=2) de un proceso que murió mid-envío
  // vuelven a pendiente. En el peor caso re-envía (preferible a perder).
  try {
    const recuperados = mem.resetProgramadosEnVuelo();
    if (recuperados) console.warn(`[programados] ${recuperados} programado(s) quedaron "en vuelo" de un proceso anterior — devueltos a pendiente`);
  } catch (e) { console.error('[programados] reset en-vuelo:', e.message); }
  // Primer tick inmediato (por si hubo downtime con mensajes acumulados)
  tick(waClient).catch(err => console.error('[programados] tick inicial:', err));
  return setInterval(() => {
    tick(waClient).catch(err => console.error('[programados] tick:', err));
  }, intervaloMs);
}

module.exports = { iniciarProgramados, tick };
