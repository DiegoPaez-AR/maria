// executor.js — ejecuta las acciones devueltas por Claude.
//
// Todas las acciones reciben `ctx.usuario` (el usuario al que pertenece la
// conversación) y se guardan asociadas a su usuario_id. enviar_wa resuelve
// el @lid del destinatario si es un usuario activo (cada usuario tiene su
// wa_lid capturado en usuarios.wa_lid).
//
// Acciones owner-only (gateadas acá): crear_usuario, borrar_usuario.
// Acciones del flujo "desconocido": rutear_a_usuario, cerrar_desconocido
// (procesadas por whatsapp-handler/gmail-handler, no por este executor).

const mem = require('./memory');
const g   = require('./google');
const usuarios = require('./usuarios');

/**
 * Ejecuta acciones. ctx debe traer: { usuario, waClient, canalOrigen }.
 */
async function ejecutarAcciones(acciones = [], ctx = {}) {
  if (!Array.isArray(acciones)) return [];
  if (!ctx.usuario || !ctx.usuario.id) {
    throw new Error('ejecutarAcciones: ctx.usuario requerido');
  }
  const resultados = [];
  for (const [i, accion] of acciones.entries()) {
    try {
      const res = await ejecutarUna(accion, ctx);
      resultados.push({ ok: true, accion, resultado: res });
      mem.log({
        usuarioId: ctx.usuario.id,
        canal: 'sistema', direccion: 'interno',
        cuerpo: `acción ejecutada: ${accion.tipo}`,
        metadata: { accion, resultado: res, canalOrigen: ctx.canalOrigen },
      });
    } catch (err) {
      resultados.push({ ok: false, accion, error: err.message });
      mem.log({
        usuarioId: ctx.usuario.id,
        canal: 'sistema', direccion: 'interno',
        cuerpo: `acción FALLÓ: ${accion.tipo} — ${err.message}`,
        metadata: { accion, error: err.message, canalOrigen: ctx.canalOrigen },
      });
      console.error(`[executor] acción #${i} (${accion.tipo}) falló:`, err.message);
    }
  }
  return resultados;
}

async function ejecutarUna(accion, ctx) {
  switch (accion.tipo) {
    case 'crear_evento':       return await _crearEvento(accion, ctx);
    case 'modificar_evento':   return await _modificarEvento(accion, ctx);
    case 'borrar_evento':      return await _borrarEvento(accion, ctx);
    case 'responder_email':    return await _responderEmail(accion, ctx);
    case 'enviar_email':       return await _enviarEmail(accion, ctx);
    case 'enviar_wa':          return await _enviarWA(accion, ctx);
    case 'reenviar_wa':        return await _reenviarWA(accion, ctx);
    case 'agregar_pendiente':  return _agregarPendiente(accion, ctx);
    case 'quitar_pendiente':   return _quitarPendiente(accion, ctx);
    case 'upsert_contacto':    return _upsertContacto(accion, ctx);
    case 'programar_mensaje':  return _programarMensaje(accion, ctx);
    case 'cancelar_programado':return _cancelarProgramado(accion, ctx);
    case 'recordar_hecho':     return _recordarHecho(accion, ctx);
    case 'olvidar_hecho':      return _olvidarHecho(accion, ctx);
    case 'crear_usuario':      return _crearUsuario(accion, ctx);
    case 'actualizar_usuario': return _actualizarUsuario(accion, ctx);
    case 'borrar_usuario':     return _borrarUsuario(accion, ctx);
    case 'set_calendar_acceso': return await _setCalendarAcceso(accion, ctx);
    case 'buscar_contacto_global': return _buscarContactoGlobal(accion, ctx);
    case 'confirmar_prospecto_pendiente':
      return _confirmarProspectoPendiente(accion, ctx);
    case 'rechazar_prospecto_pendiente':
      return _rechazarProspectoPendiente(accion, ctx);
    default:
      throw new Error(`Tipo de acción desconocido: ${accion.tipo}`);
  }
}

// ─── Calendar ─────────────────────────────────────────────────────────────

async function _validarSinConflicto({ start, end, excluirEventoId, forzar, calendarId }) {
  if (forzar) return;
  const conflictos = await g.buscarConflictos({ start, end, excluirEventoId, calendarId });
  if (!conflictos.length) return;
  const detalle = conflictos.map(c => {
    const hh = c.allDay ? '(todo el día)' : `${c.start} → ${c.end}`;
    return `"${c.summary}" ${hh}`;
  }).join(' | ');
  throw new Error(`conflicto con evento(s) ya agendado(s): ${detalle}. Si el usuario confirma pisar, reemití con "forzar": true.`);
}

async function _crearEvento(a, ctx) {
  _requerir(a, ['summary', 'start', 'end']);
  const u = ctx.usuario;
  const tier = usuarios.tier(u);

  // Decidir contra qué calendar crear:
  //   tier_2 → calendar del user (autonomía total).
  //   tier_1 → calendar de Maria + chequea conflictos en calendar del user.
  //   tier_0 → calendar de Maria, sin chequeo (no tenemos visibilidad).
  // En tier 0/1 sumamos al user como attendee para que reciba el invite.
  const enCalDelUsuario = tier === 'tier_2';
  const calendarId = enCalDelUsuario
    ? u.calendar_id
    : await g.getMariaCalendarId();

  // Si no es en su propio calendar y el user no tiene email, no podemos invitarlo.
  if (!enCalDelUsuario && !u.email) {
    throw new Error(`crear_evento: ${u.nombre} no tiene calendar de escritura ni email registrado — no puedo agendarle nada. Pedile el email primero.`);
  }

  // Conflicto: chequeamos contra el calendar del user si tenemos lectura.
  if (tier === 'tier_2' || tier === 'tier_1') {
    await _validarSinConflicto({ start: a.start, end: a.end, forzar: a.forzar, calendarId: u.calendar_id });
  }

  // Attendees: en tier 0/1 sumamos al user automáticamente (para que reciba
  // el invite). En tier 2 NO hace falta porque el evento ya está en su calendar.
  const attendeesFinal = (a.attendees || []).slice();
  if (!enCalDelUsuario && u.email) {
    const yaInvitado = attendeesFinal.some(em => String(em).toLowerCase() === u.email.toLowerCase());
    if (!yaInvitado) attendeesFinal.push(u.email);
  }

  const ev = await g.crearEvento({
    summary: a.summary,
    descripcion: a.descripcion || '',
    ubicacion: a.ubicacion || '',
    start: a.start,
    end: a.end,
    attendees: attendeesFinal,
    meet: a.meet,
    calendarId,
  });

  mem.log({
    usuarioId: u.id,
    canal: 'calendar', direccion: 'saliente',
    cuerpo: `creado: ${ev.summary} (${ev.start} → ${ev.end})${ev.meetLink ? ' · Meet: ' + ev.meetLink : ''}${enCalDelUsuario ? '' : ' [en calendar de Maria]'}`,
    metadata: { eventoId: ev.id, link: ev.link, meetLink: ev.meetLink, calendarId, tier },
  });
  return { id: ev.id, summary: ev.summary, link: ev.link, meetLink: ev.meetLink, calendarId, tier };
}

async function _modificarEvento(a, ctx) {
  _requerir(a, ['id']);
  const u = ctx.usuario;
  const tier = usuarios.tier(u);

  // Resolver contra qué calendar trabajar. En tier 0/1 los eventos creados
  // por Maria viven en su calendar; en tier 2 están en el del user.
  // a.calendarId opcional permite override desde el LLM si supiera el path.
  const calendarId = a.calendarId
    || (tier === 'tier_2' ? u.calendar_id : await g.getMariaCalendarId());

  // Tier 1: si el evento NO fue creado por Maria, NO podemos modificarlo
  // (sin write access). Bloqueamos con un error claro.
  if (tier === 'tier_1') {
    try {
      const ev = await g.obtenerEvento ? await g.obtenerEvento({ id: a.id, calendarId }) : null;
      const organizer = (ev?.organizerEmail || '').toLowerCase();
      const meEmail = (g.MARIA_EMAIL || '').toLowerCase();
      if (organizer && organizer !== meEmail) {
        throw new Error(`modificar_evento: este evento (${a.id}) está en el calendar de ${u.nombre} pero lo creó otra persona (${organizer}); no tengo permiso de escritura para cambiarlo. ${u.nombre} tiene que modificarlo desde su lado.`);
      }
    } catch (err) {
      // Si obtenerEvento no existe o falla con un error distinto al de
      // ownership, propagamos. Si es nuestro error de ownership, también.
      if (err.message?.startsWith('modificar_evento:')) throw err;
      // Si fue solo "obtenerEvento no implementado", seguimos al modificar
      // (la API de Google ya nos va a rebotar si no podemos escribir).
    }
  }

  if (a.start && a.end) {
    // Conflicto: si tenemos lectura del calendar del user (tier 1/2),
    // chequeamos ahí. En tier 0 no podemos.
    if (tier === 'tier_2' || tier === 'tier_1') {
      await _validarSinConflicto({ start: a.start, end: a.end, excluirEventoId: a.id, forzar: a.forzar, calendarId: u.calendar_id });
    }
  }

  const ev = await g.modificarEvento({
    id: a.id,
    summary: a.summary,
    descripcion: a.descripcion,
    ubicacion: a.ubicacion,
    start: a.start,
    end: a.end,
    calendarId,
  });
  mem.log({
    usuarioId: u.id,
    canal: 'calendar', direccion: 'saliente',
    cuerpo: `modificado: ${ev.summary} (${ev.start} → ${ev.end})`,
    metadata: { eventoId: ev.id, calendarId, tier },
  });
  return { id: ev.id, summary: ev.summary };
}

async function _borrarEvento(a, ctx) {
  _requerir(a, ['id']);
  const u = ctx.usuario;
  const tier = usuarios.tier(u);
  const calendarId = a.calendarId
    || (tier === 'tier_2' ? u.calendar_id : await g.getMariaCalendarId());

  // Tier 1: bloquear borrado si el organizer no es Maria.
  if (tier === 'tier_1') {
    try {
      const ev = await g.obtenerEvento ? await g.obtenerEvento({ id: a.id, calendarId }) : null;
      const organizer = (ev?.organizerEmail || '').toLowerCase();
      const meEmail = (g.MARIA_EMAIL || '').toLowerCase();
      if (organizer && organizer !== meEmail) {
        throw new Error(`borrar_evento: este evento (${a.id}) lo creó ${organizer} (no yo); no tengo permiso de escritura para borrarlo. ${u.nombre} tiene que borrarlo desde su lado.`);
      }
    } catch (err) {
      if (err.message?.startsWith('borrar_evento:')) throw err;
    }
  }

  await g.borrarEvento({ id: a.id, calendarId });
  mem.log({
    usuarioId: u.id,
    canal: 'calendar', direccion: 'saliente',
    cuerpo: `borrado: evento ${a.id}${tier === 'tier_2' ? '' : ' [del calendar de Maria]'}`,
    metadata: { eventoId: a.id, calendarId, tier },
  });
  return { id: a.id, borrado: true };
}

// ─── Gmail ────────────────────────────────────────────────────────────────

async function _responderEmail(a, ctx) {
  _requerir(a, ['messageId', 'texto']);
  const r = await g.responderEmail(a.messageId, a.texto, {
    replyAll: !!a.replyAll,
    cc: a.cc, // si viene undefined no overridea; si viene null lo limpia
  });
  mem.log({
    usuarioId: ctx.usuario.id,
    canal: 'gmail', direccion: 'saliente',
    asunto: `Re: ${a.asunto || ''}`,
    cuerpo: a.texto,
    metadata: {
      inReplyTo: a.messageId,
      replyAll: !!a.replyAll,
      to: r?.to || null,
      cc: r?.cc || null,
    },
  });
  return { messageId: a.messageId, enviado: true, to: r?.to, cc: r?.cc, replyAll: !!a.replyAll };
}

// Email nuevo (sin thread previo). Diferencias con _responderEmail:
//  - no requiere messageId
//  - acepta to/cc/bcc (string o array) y replyTo opcional
//  - devuelve { id, threadId } del mensaje nuevo
async function _enviarEmail(a, ctx) {
  _requerir(a, ['to', 'asunto', 'texto']);
  const r = await g.enviarEmail({
    to: a.to,
    asunto: a.asunto,
    texto: a.texto,
    cc: a.cc || null,
    bcc: a.bcc || null,
    replyTo: a.replyTo || null,
  });
  mem.log({
    usuarioId: ctx.usuario.id,
    canal: 'gmail', direccion: 'saliente',
    asunto: a.asunto,
    cuerpo: a.texto,
    metadata: {
      to: a.to,
      cc: a.cc || null,
      bcc: a.bcc || null,
      messageId: r.id,
      threadId: r.threadId,
    },
  });
  return { messageId: r.id, threadId: r.threadId, enviado: true };
}

// ─── WhatsApp ─────────────────────────────────────────────────────────────

// Reenvía un mensaje WA usando forward NATIVO de whatsapp-web.js. No descarga
// ni re-procesa el media — levanta el msg original con getMessageById y lo
// forwardea al destino. Funciona con cualquier tipo (PDF, imagen, video, audio,
// documento, sticker, vCard, ubicación, hasta texto). El destino recibe el
// mensaje marcado como "Reenviado". Si WA purgó el media del CDN (>30 días)
// o el mensaje no existe, falla con error explícito.
async function _reenviarWA(a, ctx) {
  _requerir(a, ['messageId', 'a']);
  if (!ctx.waClient) throw new Error('reenviar_wa: waClient no disponible');
  const destino = _resolverDestinoWA(a.a);
  let original;
  try {
    original = await ctx.waClient.getMessageById(a.messageId);
  } catch (err) {
    throw new Error(`reenviar_wa: no encontré mensaje ${a.messageId}: ${err.message}`);
  }
  if (!original) throw new Error(`reenviar_wa: mensaje ${a.messageId} no existe (puede haber sido purgado)`);
  await original.forward(destino);
  mem.log({
    usuarioId: ctx.usuario.id,
    canal: 'whatsapp', direccion: 'saliente',
    de: null,
    cuerpo: `(forward de ${a.messageId} → ${destino})`,
    tipo_original: 'forward',
    metadata: { forwardOf: a.messageId, a: destino },
  });
  return { messageId: a.messageId, forwardedTo: destino };
}

/**
 * Resuelve un destino WA: si el `a` coincide con el wa_cus de algún usuario
 * activo y ese usuario tiene wa_lid capturado, preferimos el lid (WA Web
 * moderno rechaza @c.us para usuarios que no están en la libreta de Maria).
 */
function _resolverDestinoWA(a) {
  if (!a) return a;
  if (a.endsWith('@lid')) return a; // ya es lid
  const digs = a.replace(/\D/g, '');
  if (!digs) return a;
  // Buscar cualquier usuario que tenga este número como wa_cus
  const todos = usuarios.listarActivos();
  const match = todos.find(u => u.wa_cus && u.wa_cus.replace(/\D/g,'') === digs);
  if (match && match.wa_lid) return match.wa_lid;
  return a; // dejamos el @c.us — WA lo acepta si el contacto es conocido
}

async function _enviarWA(a, ctx) {
  _requerir(a, ['a', 'texto']);
  if (!ctx.waClient) throw new Error('enviar_wa: ctx.waClient no fue provisto al executor');

  let destino = _resolverDestinoWA(a.a);
  try {
    await ctx.waClient.sendMessage(destino, a.texto);
  } catch (err) {
    const esLidError = /No LID for user|invalid wid|not.{0,10}registered/i.test(err.message || '');
    if (esLidError) {
      // Último recurso: re-resolver por las dudas el usuario actualizó su lid
      const alt = _resolverDestinoWA(a.a);
      if (alt && alt !== destino) {
        await ctx.waClient.sendMessage(alt, a.texto);
        destino = alt;
      } else {
        throw new Error(`No pude mandar WA a ${a.a}: ${err.message}`);
      }
    } else {
      throw err;
    }
  }

  mem.log({
    usuarioId: ctx.usuario.id,
    canal: 'whatsapp', direccion: 'saliente',
    de: destino, cuerpo: a.texto,
    metadata: { destinoOriginal: a.a, destinoFinal: destino },
  });
  return { a: destino, enviado: true };
}

// ─── Memoria (pendientes + contactos + programados + hechos) ─────────────

function _agregarPendiente(a, ctx) {
  _requerir(a, ['desc']);
  mem.agregarPendiente(ctx.usuario.id, a.desc, a.meta || {});
  return { desc: a.desc, agregado: true };
}

function _quitarPendiente(a, ctx) {
  if (a.id == null && a.desc == null && a.indice == null) {
    throw new Error('quitar_pendiente: pasá `id`, `desc` o `indice`');
  }
  let arg;
  if (typeof a.id === 'number') arg = a.id;
  else if (typeof a.desc === 'string') arg = a.desc;
  else arg = { indice: a.indice };

  const cerrado = mem.quitarPendiente(ctx.usuario.id, arg);
  if (!cerrado) {
    throw new Error(`quitar_pendiente: no encontré el pendiente (${a.id ?? a.desc ?? `indice=${a.indice}`})`);
  }
  return { id: cerrado.id, desc: cerrado.desc, cerrado: true };
}

function _programarMensaje(a, ctx) {
  _requerir(a, ['cuando', 'canal', 'destino', 'texto']);
  if (!['whatsapp', 'gmail'].includes(a.canal)) {
    throw new Error(`programar_mensaje: canal inválido (${a.canal})`);
  }
  let destino = a.destino;
  if (a.canal === 'whatsapp') destino = _resolverDestinoWA(destino);
  const id = mem.programarMensaje({
    usuarioId: ctx.usuario.id,
    cuando: a.cuando,
    canal: a.canal,
    destino,
    asunto: a.asunto || null,
    texto: a.texto,
    razon: a.razon || 'usuario',
    metadata: a.metadata || null,
  });
  return { id, cuando: a.cuando, canal: a.canal, destino, programado: true };
}

function _cancelarProgramado(a, ctx) {
  _requerir(a, ['id']);
  mem.cancelarProgramado(a.id);
  return { id: a.id, cancelado: true };
}

function _recordarHecho(a, ctx) {
  _requerir(a, ['clave', 'valor']);
  mem.recordarHecho({ usuarioId: ctx.usuario.id, clave: a.clave, valor: a.valor, fuente: a.fuente || null });
  return { clave: a.clave, guardado: true };
}

function _olvidarHecho(a, ctx) {
  _requerir(a, ['clave']);
  mem.olvidarHecho(ctx.usuario.id, a.clave);
  return { clave: a.clave, olvidado: true };
}

function _upsertContacto(a, ctx) {
  _requerir(a, ['nombre']);
  const c = mem.upsertContacto({
    usuarioId: ctx.usuario.id,
    nombre: a.nombre,
    whatsapp: a.whatsapp || null,
    email: a.email || null,
    notas: a.notas || null,
  });
  return { id: c.id, nombre: c.nombre };
}

// ─── Acciones del owner ──────────────────────────────────────────────────

function _crearUsuario(a, ctx) {
  if (!usuarios.esOwner(ctx.usuario.id)) {
    throw new Error('crear_usuario: solo el owner puede crear usuarios');
  }
  _requerir(a, ['nombre']);
  const u = usuarios.crear({
    nombre: a.nombre,
    wa_cus: a.wa_cus || null,
    email: a.email || null,
    calendar_id: a.calendar_id || null,
    tz: a.tz || null,
    brief_hora: a.brief_hora || null,
    brief_minuto: a.brief_minuto || null,
  });
  console.log(`[executor] usuario creado: id=${u.id} nombre=${u.nombre}${u.calendar_id ? '' : ' (sin calendar_id todavía)'}`);
  return { id: u.id, nombre: u.nombre, creado: true, calendar_id: u.calendar_id || null };
}

function _actualizarUsuario(a, ctx) {
  if (!usuarios.esOwner(ctx.usuario.id)) {
    throw new Error('actualizar_usuario: solo el owner puede actualizar usuarios');
  }
  _requerir(a, ['id']);
  const patch = {};
  for (const k of ['nombre', 'wa_cus', 'email', 'calendar_id', 'tz', 'brief_hora', 'brief_minuto']) {
    if (a[k] !== undefined) patch[k] = a[k];
  }
  if (!Object.keys(patch).length) throw new Error('actualizar_usuario: no hay campos para cambiar');
  const u = usuarios.actualizar(a.id, patch);
  console.log(`[executor] usuario actualizado: id=${u.id} nombre=${u.nombre} campos=${Object.keys(patch).join(',')}`);
  return { id: u.id, nombre: u.nombre, actualizado: true, campos: Object.keys(patch) };
}

function _borrarUsuario(a, ctx) {
  if (!usuarios.esOwner(ctx.usuario.id)) {
    throw new Error('borrar_usuario: solo el owner puede borrar usuarios');
  }
  _requerir(a, ['id']);
  if (a.id === ctx.usuario.id) throw new Error('borrar_usuario: no te podés borrar a vos mismo');
  const u = usuarios.desactivar(a.id);
  console.log(`[executor] usuario desactivado: id=${u.id} nombre=${u.nombre}`);
  return { id: u.id, nombre: u.nombre, desactivado: true };
}

// Owner-only: busca en la libreta de contactos de CUALQUIER usuario activo.
// Uso típico: el owner pregunta "quién es X?" o "tengo el teléfono de Y?" y
// Maria necesita mirar cross-usuario (no solo la libreta del owner).
// El aislamiento de conversaciones/calendario NO aplica acá — los contactos
// son metadata que el owner puede inspeccionar como administrador.
function _buscarContactoGlobal(a, ctx) {
  if (!usuarios.esOwner(ctx.usuario.id)) {
    throw new Error('buscar_contacto_global: solo el owner');
  }
  if (!a.nombre && !a.whatsapp && !a.email) {
    throw new Error('buscar_contacto_global: pasá al menos uno de nombre/whatsapp/email');
  }
  const resultados = mem.buscarContactoCrossUsuario({
    whatsapp: a.whatsapp || null,
    email: a.email || null,
    nombre: a.nombre || null,
  });
  return resultados.map(c => {
    const u = usuarios.obtener(c.usuario_id);
    return {
      usuario: u ? { id: u.id, nombre: u.nombre, rol: u.rol } : { id: c.usuario_id, nombre: '(usuario desconocido)' },
      nombre: c.nombre,
      whatsapp: c.whatsapp,
      email: c.email,
      notas: c.notas,
    };
  });
}

// ─── Prospectos pendientes (confirmación del owner antes de crear) ──────
//
// Cuando unknown-flow LLM-detecta que un remitente es probablemente un
// "prospecto" (alguien al que el owner le pidió a Maria que agregue),
// NO lo crea automáticamente. Guarda el estado y le pregunta al owner por
// WA. El owner responde afirmativa o negativamente, y Claude (en el prompt
// del owner) emite una de estas dos acciones.
//
// El estado vive en estado_usuario[owner.id] con clave
// `unknown_pending:<canal>:<remitenteId>` — lo leemos acá para armar el
// create + sacar el estado + reprocesar el mensaje original.

const unknownFlow = require('./unknown-flow');

function _confirmarProspectoPendiente(a, ctx) {
  if (!usuarios.esOwner(ctx.usuario.id)) {
    throw new Error('confirmar_prospecto_pendiente: solo el owner');
  }
  _requerir(a, ['canal', 'remitente_id']);
  const pend = unknownFlow.leerProspectoPendiente(a.canal, a.remitente_id);
  if (!pend) throw new Error(`no hay prospecto pendiente para canal=${a.canal} remitente=${a.remitente_id}`);

  // Datos del usuario nuevo: mergear lo que vino en la acción con lo
  // detectado en el prospecto (nombre sugerido por LLM, wa_cus/email
  // derivados del remitente).
  const nombre = a.nombre || pend.nombre_sugerido;
  if (!nombre) throw new Error('confirmar_prospecto_pendiente: falta `nombre` (no había sugerido tampoco)');

  const wa_cus = a.wa_cus !== undefined ? a.wa_cus : pend.wa_cus_sugerido;
  const email  = a.email  !== undefined ? a.email  : pend.email_sugerido;
  const calendar_id = a.calendar_id !== undefined ? a.calendar_id : null;

  const u = usuarios.crear({
    nombre,
    wa_cus: wa_cus || null,
    email:  email  || null,
    calendar_id: calendar_id || null,
    tz: a.tz || null,
    brief_hora: a.brief_hora || null,
    brief_minuto: a.brief_minuto || null,
  });
  unknownFlow.limpiarProspectoPendiente(a.canal, a.remitente_id);
  console.log(`[executor] prospecto confirmado: id=${u.id} nombre=${u.nombre} canal=${a.canal} remitente=${a.remitente_id}`);
  return {
    id: u.id,
    nombre: u.nombre,
    creado: true,
    calendar_id: u.calendar_id || null,
    prospecto_cerrado: { canal: a.canal, remitente_id: a.remitente_id },
  };
}

function _rechazarProspectoPendiente(a, ctx) {
  if (!usuarios.esOwner(ctx.usuario.id)) {
    throw new Error('rechazar_prospecto_pendiente: solo el owner');
  }
  _requerir(a, ['canal', 'remitente_id']);
  const pend = unknownFlow.leerProspectoPendiente(a.canal, a.remitente_id);
  if (!pend) throw new Error(`no hay prospecto pendiente para canal=${a.canal} remitente=${a.remitente_id}`);
  unknownFlow.limpiarProspectoPendiente(a.canal, a.remitente_id);
  console.log(`[executor] prospecto rechazado: canal=${a.canal} remitente=${a.remitente_id}`);
  return { rechazado: true, canal: a.canal, remitente_id: a.remitente_id };
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function _requerir(obj, campos) {
  const faltan = campos.filter(k => obj[k] == null || obj[k] === '');
  if (faltan.length) throw new Error(`Faltan campos requeridos: ${faltan.join(', ')}`);
}

// Setea calendar_acceso para un usuario (none|read|write|autodetect).
// Si modo='autodetect', usa g.chequearAccesoCalendar para mirar el accessRole
// real que Maria tiene sobre el calendar del usuario en su calendarList.
// Sólo el owner puede ejecutarla.
async function _setCalendarAcceso(a, ctx) {
  if (!usuarios.esOwner(ctx.usuario.id)) {
    throw new Error('set_calendar_acceso: solo el owner puede setear este campo');
  }
  _requerir(a, ['usuarioId']);
  const u = usuarios.obtener(a.usuarioId);
  if (!u) throw new Error(`set_calendar_acceso: usuario ${a.usuarioId} no existe`);

  let modoFinal = a.modo;
  let detectado = null;

  if (modoFinal === 'autodetect' || (!modoFinal && a.autodetect)) {
    if (!u.calendar_id) {
      modoFinal = 'none';
    } else {
      detectado = await g.chequearAccesoCalendar(u.calendar_id);
      modoFinal = detectado;
    }
  }

  if (!['none', 'read', 'write'].includes(modoFinal)) {
    throw new Error(`set_calendar_acceso: modo inválido "${modoFinal}". Usar none|read|write|autodetect.`);
  }

  usuarios.setearCalendarAcceso(u.id, modoFinal);
  mem.log({
    usuarioId: u.id,
    canal: 'sistema', direccion: 'interno',
    cuerpo: `calendar_acceso seteado a "${modoFinal}"${detectado ? ' (autodetectado)' : ''}`,
    metadata: { calendarAccesoNuevo: modoFinal, autodetect: !!a.autodetect, detectado },
  });
  console.log(`[executor] set_calendar_acceso/${u.nombre}: ${modoFinal}${detectado ? ' (autodetect)' : ''}`);
  return { usuarioId: u.id, calendar_acceso: modoFinal, autodetect: !!a.autodetect, detectado };
}

module.exports = { ejecutarAcciones };
