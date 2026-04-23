// unknown-flow.js — flujo de "remitente desconocido"
//
// Cuando alguien escribe a Maria por WA o Gmail y no matchea con ningún
// usuario registrado, entramos en este flujo:
//
//   Primera vez:
//     1. Guardamos estado (clave `unknown:<id>`) con el mensaje original.
//     2. Respondemos al desconocido pidiéndole para quién es.
//     3. Notificamos al owner por WA.
//
//   Segunda vez (ya preguntamos):
//     1. Intentamos matchear el texto del mensaje contra nombres de
//        usuarios activos (primer nombre o nombre completo, case-insensitive,
//        word boundary).
//     2. Si hay UN match inequívoco → delegamos al handler del usuario
//        destinatario para que procese el mensaje original como si le
//        hubiera llegado directo. Respondemos al desconocido "listo, se lo
//        paso" y notificamos al owner + limpiamos estado.
//     3. Si hay 0 o múltiples matches → respondemos "no conozco esa
//        persona", limpiamos estado, notificamos al owner.
//
// Estado: usamos estado_usuario(OWNER_ID, clave) porque el flujo vive a
// nivel sistema (el owner es quien monitorea). El estado es un objeto JSON:
//   { canal, original_body, messageId, nombre_pushname, ts }

const mem = require('./memory');
const usuarios = require('./usuarios');

function _claveUnknown(canal, remitenteId) {
  return `unknown:${canal}:${remitenteId}`;
}

function leerEstado(canal, remitenteId) {
  const owner = usuarios.obtenerOwner();
  if (!owner) return null;
  return mem.getEstadoUsuario(owner.id, _claveUnknown(canal, remitenteId));
}

function guardarEstado(canal, remitenteId, data) {
  const owner = usuarios.obtenerOwner();
  if (!owner) return;
  mem.setEstadoUsuario(owner.id, _claveUnknown(canal, remitenteId), data);
}

function limpiarEstado(canal, remitenteId) {
  const owner = usuarios.obtenerOwner();
  if (!owner) return;
  mem.borrarEstadoUsuario(owner.id, _claveUnknown(canal, remitenteId));
}

// ─── Matching de nombres ─────────────────────────────────────────────────

/**
 * Normaliza un string para matching: lower, sin tildes, sin signos.
 */
function _norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Dado el texto que mandó el desconocido (respuesta a "¿para quién es?"),
 * tratar de identificar a qué usuario se refiere. Matcheo simple contra
 * primer nombre y nombre completo con word boundary.
 */
function matchearUsuario(texto) {
  const t = _norm(texto);
  if (!t) return null;
  const activos = usuarios.listarActivos();
  const hits = [];
  for (const u of activos) {
    const nombre   = _norm(u.nombre);
    const primero  = nombre.split(' ')[0];
    // Word boundary simulada: rodear con espacios
    const padded = ` ${t} `;
    const hitsNombre  = nombre  && padded.includes(` ${nombre} `);
    const hitsPrimero = primero && padded.includes(` ${primero} `);
    if (hitsNombre || hitsPrimero) hits.push(u);
  }
  if (hits.length === 1) return hits[0];
  return null; // 0 o >1 matches → ambiguo
}

// ─── Notificación al owner ───────────────────────────────────────────────

async function _notificarOwner(waClient, texto) {
  const owner = usuarios.obtenerOwner();
  if (!owner || !waClient) return false;
  const destino = owner.wa_lid || owner.wa_cus;
  if (!destino) {
    console.warn('[unknown-flow] owner no tiene wa_lid ni wa_cus — no notifico');
    return false;
  }
  try {
    await waClient.sendMessage(destino, texto);
    mem.log({
      usuarioId: owner.id,
      canal: 'whatsapp', direccion: 'saliente',
      de: destino, cuerpo: texto,
      metadata: { tipo: 'unknown_flow_aviso' },
    });
    return true;
  } catch (err) {
    console.error('[unknown-flow] notificar owner falló:', err.message);
    return false;
  }
}

// ─── Handlers ────────────────────────────────────────────────────────────

/**
 * Handler para WhatsApp. Devuelve true si fue procesado acá (flujo
 * desconocido), false si el caller tiene que procesar normal.
 *
 * Params:
 *   - client: WA Client
 *   - msg:    mensaje original
 *   - cuerpo: texto ya extraído (con audio transcripto)
 *   - reprocesarComoUsuario: función (usuario, entradaOriginal) que
 *     arranca el pipeline normal para el usuario destinatario.
 */
async function handleWA({ client, msg, cuerpo, reprocesarComoUsuario }) {
  const from = msg.from;
  const pushname = msg._data?.notifyName || null;
  const messageId = msg.id?._serialized || null;
  const estado = leerEstado('whatsapp', from);

  if (!estado) {
    // Primera vez — pedir a quién va.
    const preguntaTxt = `¡Hola! Soy María, asistente personal. No te tengo registrado. ¿Para quién de las personas que asisto es este mensaje?`;
    try {
      await client.sendMessage(from, preguntaTxt);
    } catch (err) {
      console.error('[unknown-flow/wa] sendMessage falló:', err.message);
    }
    guardarEstado('whatsapp', from, {
      canal: 'whatsapp',
      original_body: cuerpo,
      messageId,
      pushname,
      ts: new Date().toISOString(),
    });
    const owner = usuarios.obtenerOwner();
    if (owner) {
      mem.log({
        usuarioId: owner.id,
        canal: 'whatsapp', direccion: 'entrante',
        de: from, nombre: pushname,
        cuerpo,
        metadata: { tipo: 'unknown_first', messageId },
      });
    }
    await _notificarOwner(client,
      `🚪 Te escribe alguien por WA que no conozco: *${pushname || from}* (${from}).\n\nMensaje: "${cuerpo.slice(0, 400)}"\n\nLe pregunté para quién va.`
    );
    console.log(`[unknown-flow/wa] primer contacto de ${from} — preguntando`);
    return true;
  }

  // Segunda vez — intentar matchear.
  const match = matchearUsuario(cuerpo);
  if (match) {
    // Si el sender dice ser un usuario que todavía no tiene wa_lid capturado,
    // y el from es @lid, capturamos. Es la única manera de que el usuario
    // "se presente" a Maria después de ser creado por el owner. Nota: esto
    // confía en que el sender es realmente quien dice — si un desconocido se
    // hace pasar por Juan, captura el slot hasta que el Juan real haga lo
    // mismo (y lo sobrescribe). Para un setup personal es aceptable; si se
    // abusa, el owner lo ve en la notificación.
    let capturadoLid = false;
    if (from && from.endsWith('@lid') && !match.wa_lid) {
      usuarios.setWaLid(match.id, from);
      capturadoLid = true;
      console.log(`[unknown-flow/wa] capturado @lid para ${match.nombre}: ${from}`);
    }

    try {
      await client.sendMessage(from, `Listo, se lo paso a ${match.nombre}. Gracias.`);
    } catch (err) {
      console.error('[unknown-flow/wa] ack falló:', err.message);
    }
    await _notificarOwner(client,
      `➡️ Routeé el mensaje de *${pushname || from}* (${from}) a *${match.nombre}* (id=${match.id}).${capturadoLid ? `\n(Capturé su @lid.)` : ''}\n\nMensaje original: "${estado.original_body.slice(0, 400)}"`
    );
    limpiarEstado('whatsapp', from);
    // Reprocesar el mensaje ORIGINAL como si le hubiera llegado al usuario
    // destinatario (Claude decide qué hacer: típicamente agregar pendiente +
    // notificar al usuario por WA).
    try {
      await reprocesarComoUsuario(match, {
        de: from,
        nombre: pushname || from,
        cuerpo: estado.original_body,
        esAudio: false,
        messageId: estado.messageId,
      });
    } catch (err) {
      console.error('[unknown-flow/wa] reprocesar falló:', err.message);
    }
    console.log(`[unknown-flow/wa] routeado ${from} → ${match.nombre} (id=${match.id})`);
    return true;
  }

  // No matcheó — cerrar.
  try {
    await client.sendMessage(from, `Perdón, no conozco a esa persona. Cierro acá.`);
  } catch (err) {
    console.error('[unknown-flow/wa] cerrar falló:', err.message);
  }
  await _notificarOwner(client,
    `❌ Cerré el thread con *${pushname || from}* (${from}) por WA — no matcheé con ningún usuario.\n\nÚltimo mensaje: "${cuerpo.slice(0, 400)}"`
  );
  limpiarEstado('whatsapp', from);
  console.log(`[unknown-flow/wa] cerrado ${from} — sin match`);
  return true;
}

/**
 * Handler para Gmail. Mismo esquema que WA pero el canal es email.
 *
 * Params:
 *   - waClient: para notificar al owner
 *   - email: objeto del gmail-handler ({ id, de, asunto, cuerpo, threadId })
 *   - reprocesarComoUsuario: función (usuario) que arranca el pipeline para
 *     el usuario destinatario.
 *   - responderEmailFn: función (messageId, texto) → Promise para responderle
 *     al desconocido.
 */
async function handleEmail({ waClient, email, reprocesarComoUsuario, responderEmailFn }) {
  const remitenteId = email.de; // header From completo, ej. "Juan <juan@x.com>"
  const estado = leerEstado('gmail', remitenteId);

  if (!estado) {
    const preguntaTxt = `Hola,

Soy María, asistente personal. No te tengo registrado en mi libreta. ¿Para quién de las personas que asisto es este mensaje?

Saludos,
María`;
    try {
      await responderEmailFn(email.id, preguntaTxt);
    } catch (err) {
      console.error('[unknown-flow/gmail] responder falló:', err.message);
    }
    guardarEstado('gmail', remitenteId, {
      canal: 'gmail',
      original_body: email.cuerpo || email.snippet || '',
      asunto: email.asunto,
      messageId: email.id,
      threadId: email.threadId,
      ts: new Date().toISOString(),
    });
    const owner = usuarios.obtenerOwner();
    if (owner) {
      mem.log({
        usuarioId: owner.id,
        canal: 'gmail', direccion: 'entrante',
        de: email.de, asunto: email.asunto,
        cuerpo: email.cuerpo || email.snippet || '',
        metadata: { tipo: 'unknown_first', messageId: email.id },
      });
    }
    await _notificarOwner(waClient,
      `🚪 Te escribe alguien por email que no conozco: ${email.de}.\n\nAsunto: "${email.asunto || '(sin asunto)'}"\nMensaje: "${(email.cuerpo || email.snippet || '').slice(0, 400)}"\n\nLe pregunté para quién va.`
    );
    console.log(`[unknown-flow/gmail] primer contacto de ${email.de}`);
    return true;
  }

  // Segunda vez — matchear contra el texto del email.
  const match = matchearUsuario(email.cuerpo || email.snippet || '');
  if (match) {
    try {
      await responderEmailFn(email.id, `Gracias, se lo paso a ${match.nombre}.\n\nSaludos,\nMaría`);
    } catch (err) {
      console.error('[unknown-flow/gmail] ack falló:', err.message);
    }
    await _notificarOwner(waClient,
      `➡️ Routeé el email de ${email.de} a *${match.nombre}* (id=${match.id}).\n\nAsunto: "${estado.asunto || ''}"\nOriginal: "${(estado.original_body || '').slice(0, 400)}"`
    );
    limpiarEstado('gmail', remitenteId);
    try {
      await reprocesarComoUsuario(match, {
        de: email.de,
        email: email.de,
        asunto: estado.asunto || email.asunto,
        cuerpo: estado.original_body || email.cuerpo,
        messageId: estado.messageId || email.id,
      });
    } catch (err) {
      console.error('[unknown-flow/gmail] reprocesar falló:', err.message);
    }
    console.log(`[unknown-flow/gmail] routeado ${email.de} → ${match.nombre}`);
    return true;
  }

  // No match — cerrar.
  try {
    await responderEmailFn(email.id, `Perdón, no conozco a esa persona. Cierro acá.\n\nSaludos,\nMaría`);
  } catch (err) {
    console.error('[unknown-flow/gmail] cerrar falló:', err.message);
  }
  await _notificarOwner(waClient,
    `❌ Cerré el thread de email con ${email.de} — no matcheé con ningún usuario.\n\nÚltimo mensaje: "${(email.cuerpo || '').slice(0, 400)}"`
  );
  limpiarEstado('gmail', remitenteId);
  return true;
}

module.exports = {
  handleWA,
  handleEmail,
  matchearUsuario,
  leerEstado,
  guardarEstado,
  limpiarEstado,
};
