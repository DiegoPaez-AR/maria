// wa-send.js — wrapper canónico para envíos de WhatsApp a un usuario o a
// un destino crudo. Centraliza la resolución de @c.us↔@lid, el catch+
// fallback que ya existía en executor._enviarWA, el log saliente en
// `eventos`, y la integración con el watchdog del cliente WA.
//
// Antes esta lógica vivía sólo en executor._enviarWA; los dispatchers
// (morning-brief, recordatorios, programados, etc.) hacían
// `client.sendMessage(usuario.wa_lid || usuario.wa_cus, texto)` crudo,
// sin fallback. Eso causó el spam de morning-brief de Doris durante 2
// días: su wa_cus estaba corrupto y morning-brief no podía recuperarse.

const mem = require('./memory');
const usuarios = require('./usuarios');

// Errores que sugieren "el wid no resolvió" — incluye el "t" minificado
// que vimos en whatsapp-web.js cuando le pasás un LID con sufijo @c.us.
const LID_ERR_RE = /No LID for user|invalid wid|not.{0,10}registered|^t$/i;

/**
 * Para destinos "crudos" (sin objeto usuario): si el string matchea
 * exactamente el wa_cus o el wa_lid de un usuario activo, devolvemos el
 * que mejor entrega (preferimos @lid si está capturado).
 */
function resolverPorPersistencia(destinoCrudo) {
  if (!destinoCrudo) return destinoCrudo;
  if (destinoCrudo.endsWith('@lid')) return destinoCrudo;
  const digs = destinoCrudo.replace(/\D/g, '');
  if (!digs) return destinoCrudo;
  const todos = usuarios.listarActivos();
  const match = todos.find(u => u.wa_cus && u.wa_cus.replace(/\D/g, '') === digs);
  if (match && match.wa_lid) return match.wa_lid;
  return destinoCrudo;
}

/**
 * Envía texto a un usuario. Maneja:
 *  - elección de wa_lid (preferido) vs wa_cus
 *  - fallback automático si el primer destino tira error de LID/wid
 *  - log saliente en `eventos` (canal=whatsapp, direccion=saliente)
 *  - notificación al watchdog del cliente WA cuando es error no recuperable
 *
 * Devuelve { destinoFinal, enviado: true } en éxito; tira Error en falla.
 *
 * opts:
 *   tag: prefijo para los console.error y el watchdog (ej. "morning-brief/Diego")
 *   metadata: objeto extra que va a `eventos.metadata_json`
 *   logSaliente: default true. Pasar false si el caller loguea por su cuenta.
 */
async function enviarWAUsuario(client, usuario, texto, opts = {}) {
  const { tag = 'wa-send', metadata = null, logSaliente = true } = opts;
  if (!client) throw new Error(`${tag}: waClient requerido`);
  if (!usuario) throw new Error(`${tag}: usuario requerido`);

  // Orden de preferencia: @lid primero (formato moderno, no requiere
  // libreta), después @c.us como fallback.
  const candidatos = [];
  if (usuario.wa_lid) candidatos.push(usuario.wa_lid);
  if (usuario.wa_cus) candidatos.push(usuario.wa_cus);
  if (!candidatos.length) {
    throw new Error(`${tag}: usuario ${usuario.nombre} sin destinos WA (wa_lid y wa_cus vacíos)`);
  }

  let lastErr = null;
  for (const destino of candidatos) {
    try {
      await client.sendMessage(destino, texto);
      if (logSaliente) {
        mem.log({
          usuarioId: usuario.id,
          canal: 'whatsapp', direccion: 'saliente',
          de: destino, nombre: usuario.nombre, cuerpo: texto,
          metadata: { ...(metadata || {}), destinoFinal: destino, tag },
        });
      }
      return { destinoFinal: destino, enviado: true };
    } catch (err) {
      lastErr = err;
      const esLidErr = LID_ERR_RE.test(err.message || '');
      if (!esLidErr) {
        if (client._watchdogFrameMuerto) client._watchdogFrameMuerto(err, tag);
        throw err;
      }
      // Si es error de LID/wid, probamos el siguiente candidato (fallback).
    }
  }

  // Todos los candidatos fallaron con error de LID/wid.
  if (client._watchdogFrameMuerto) client._watchdogFrameMuerto(lastErr, tag);
  throw new Error(`${tag}: no entregué a ${usuario.nombre} (probé: ${candidatos.join(', ')}); último error: ${lastErr?.message || lastErr}`);
}

/**
 * Envía a un destino crudo (terceros, programados con destino libre).
 * Si el destino matchea un usuario activo, preferimos su wa_lid.
 * En caso de error de LID/wid, reintenta con el alternativo.
 *
 * opts:
 *   tag, metadata, logSaliente (igual que enviarWAUsuario)
 *   usuarioId: para asociar el evento saliente a un usuario (opcional)
 */
async function enviarWADirecto(client, destinoCrudo, texto, opts = {}) {
  const { tag = 'wa-send-directo', metadata = null, logSaliente = true, usuarioId = null } = opts;
  if (!client) throw new Error(`${tag}: waClient requerido`);
  if (!destinoCrudo) throw new Error(`${tag}: destino vacío`);

  const intento1 = resolverPorPersistencia(destinoCrudo);
  let destinoFinal = intento1;
  let resueltoVia = null;
  try {
    await client.sendMessage(intento1, texto);
  } catch (err) {
    const esLidErr = LID_ERR_RE.test(err.message || '');
    if (!esLidErr) {
      if (client._watchdogFrameMuerto) client._watchdogFrameMuerto(err, tag);
      throw err;
    }

    // Si intento1 es @c.us y falló por LID, pedirle a WA Web que resuelva el
    // wid del número via getNumberId(). Esto cubre el caso "iniciar
    // conversación con número nuevo": WA aún no descubrió el @lid del
    // destinatario, así que sendMessage al @c.us crudo rebota con "No LID
    // for user". getNumberId() hace lookup en los servers de WA y devuelve
    // el wid resuelto (puede ser @c.us con hash o @lid). Solo aplica si el
    // destinoCrudo no matchea a ningún usuario activo (los usuarios ya
    // tienen sus dos slots persistidos, ese fallback lo cubre abajo).
    let widResuelto = null;
    if (intento1.endsWith('@c.us')) {
      try {
        const numero = intento1.replace(/@c\.us$/, '');
        const wid = await client.getNumberId(numero);
        if (wid && wid._serialized && wid._serialized !== intento1) {
          widResuelto = wid._serialized;
        }
      } catch { /* getNumberId puede tirar; seguimos al fallback de usuarios */ }
    }

    if (widResuelto) {
      await client.sendMessage(widResuelto, texto);
      destinoFinal = widResuelto;
      resueltoVia = 'getNumberId';
    } else {
      // Buscar alternativo: si hay usuario que matchee, probar el otro slot.
      const u = usuarios.resolverPorWa(destinoCrudo);
      const alt = u && u.wa_lid && u.wa_lid !== intento1 ? u.wa_lid
                : u && u.wa_cus && u.wa_cus !== intento1 ? u.wa_cus
                : null;
      if (!alt) {
        if (client._watchdogFrameMuerto) client._watchdogFrameMuerto(err, tag);
        throw err;
      }
      await client.sendMessage(alt, texto);
      destinoFinal = alt;
      resueltoVia = 'usuario-alt';
    }
  }

  if (logSaliente) {
    mem.log({
      usuarioId,
      canal: 'whatsapp', direccion: 'saliente',
      de: destinoFinal, cuerpo: texto,
      metadata: { ...(metadata || {}), destinoOriginal: destinoCrudo, destinoFinal, tag, ...(resueltoVia ? { resueltoVia } : {}) },
    });
  }
  return { destinoFinal, enviado: true };
}

module.exports = { enviarWAUsuario, enviarWADirecto, resolverPorPersistencia, LID_ERR_RE };
