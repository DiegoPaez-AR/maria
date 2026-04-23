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
    case 'enviar_wa':          return await _enviarWA(accion, ctx);
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
  const calendarId = ctx.usuario.calendar_id;
  if (!calendarId) throw new Error('crear_evento: el usuario no tiene calendar_id configurado');
  await _validarSinConflicto({ start: a.start, end: a.end, forzar: a.forzar, calendarId });
  const ev = await g.crearEvento({
    summary: a.summary,
    descripcion: a.descripcion || '',
    ubicacion: a.ubicacion || '',
    start: a.start,
    end: a.end,
    attendees: a.attendees || [],
    meet: a.meet,
    calendarId,
  });
  mem.log({
    usuarioId: ctx.usuario.id,
    canal: 'calendar', direccion: 'saliente',
    cuerpo: `creado: ${ev.summary} (${ev.start} → ${ev.end})${ev.meetLink ? ' · Meet: ' + ev.meetLink : ''}`,
    metadata: { eventoId: ev.id, link: ev.link, meetLink: ev.meetLink },
  });
  return { id: ev.id, summary: ev.summary, link: ev.link, meetLink: ev.meetLink };
}

async function _modificarEvento(a, ctx) {
  _requerir(a, ['id']);
  const calendarId = ctx.usuario.calendar_id;
  if (!calendarId) throw new Error('modificar_evento: el usuario no tiene calendar_id configurado');
  if (a.start && a.end) {
    await _validarSinConflicto({ start: a.start, end: a.end, excluirEventoId: a.id, forzar: a.forzar, calendarId });
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
    usuarioId: ctx.usuario.id,
    canal: 'calendar', direccion: 'saliente',
    cuerpo: `modificado: ${ev.summary} (${ev.start} → ${ev.end})`,
    metadata: { eventoId: ev.id },
  });
  return { id: ev.id, summary: ev.summary };
}

async function _borrarEvento(a, ctx) {
  _requerir(a, ['id']);
  const calendarId = ctx.usuario.calendar_id;
  if (!calendarId) throw new Error('borrar_evento: el usuario no tiene calendar_id configurado');
  await g.borrarEvento({ id: a.id, calendarId });
  mem.log({
    usuarioId: ctx.usuario.id,
    canal: 'calendar', direccion: 'saliente',
    cuerpo: `borrado: evento ${a.id}`,
    metadata: { eventoId: a.id },
  });
  return { id: a.id, borrado: true };
}

// ─── Gmail ────────────────────────────────────────────────────────────────

async function _responderEmail(a, ctx) {
  _requerir(a, ['messageId', 'texto']);
  await g.responderEmail(a.messageId, a.texto);
  mem.log({
    usuarioId: ctx.usuario.id,
    canal: 'gmail', direccion: 'saliente',
    asunto: `Re: ${a.asunto || ''}`,
    cuerpo: a.texto,
    metadata: { inReplyTo: a.messageId },
  });
  return { messageId: a.messageId, enviado: true };
}

// ─── WhatsApp ─────────────────────────────────────────────────────────────

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

module.exports = { ejecutarAcciones };
