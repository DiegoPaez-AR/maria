// executor.js — ejecuta las acciones devueltas por Claude en formato JSON.
//
// Recibe un array de acciones (schema definido en prompt-builder.js) y las ejecuta
// secuencialmente. Cada acción devuelve un resultado que logueamos en memory como
// evento 'sistema' para tener trazabilidad cross-canal.
//
// Uso:
//   const { ejecutarAcciones } = require('./executor');
//   const resultados = await ejecutarAcciones(acciones, { waClient, canalOrigen });
//
// Donde:
//   - acciones:    array del JSON de Claude
//   - waClient:    Client de whatsapp-web.js (para acciones enviar_wa)
//   - canalOrigen: 'whatsapp' | 'gmail' — útil para trazas

const mem = require('./memory');
const g   = require('./google');

// WhatsApp Web moderno usa IDs @lid para usuarios que no están en tu libreta.
// Si Claude emite un enviar_wa hacia el @c.us legacy de Diego, lo resolvemos
// automáticamente contra el @lid capturado en runtime (ver whatsapp-handler).
const DIEGO_WA_CUS = process.env.DIEGO_WA || '541132317896@c.us';

/**
 * Ejecuta una lista de acciones. No corta en el primer error — sigue con las demás
 * y reporta todo al final.
 */
async function ejecutarAcciones(acciones = [], ctx = {}) {
  if (!Array.isArray(acciones)) return [];
  const resultados = [];
  for (const [i, accion] of acciones.entries()) {
    try {
      const res = await ejecutarUna(accion, ctx);
      resultados.push({ ok: true, accion, resultado: res });
      mem.log({
        canal: 'sistema', direccion: 'interno',
        cuerpo: `acción ejecutada: ${accion.tipo}`,
        metadata: { accion, resultado: res, canalOrigen: ctx.canalOrigen },
      });
    } catch (err) {
      resultados.push({ ok: false, accion, error: err.message });
      mem.log({
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
    case 'crear_evento':    return await _crearEvento(accion);
    case 'modificar_evento':return await _modificarEvento(accion);
    case 'borrar_evento':   return await _borrarEvento(accion);
    case 'responder_email': return await _responderEmail(accion);
    case 'enviar_wa':       return await _enviarWA(accion, ctx);
    case 'agregar_pendiente': return _agregarPendiente(accion);
    case 'quitar_pendiente':  return _quitarPendiente(accion);
    case 'upsert_contacto': return _upsertContacto(accion);
    case 'programar_mensaje':  return _programarMensaje(accion);
    case 'cancelar_programado':return _cancelarProgramado(accion);
    case 'recordar_hecho':     return _recordarHecho(accion);
    case 'olvidar_hecho':      return _olvidarHecho(accion);
    default:
      throw new Error(`Tipo de acción desconocido: ${accion.tipo}`);
  }
}

// ─── Calendar ─────────────────────────────────────────────────────────────

// Antes de crear o modificar, chequear solapamientos duros contra la agenda.
// Si hay conflicto, tirar error — Claude tiene que re-negociar con el otro contacto.
// El `forzar: true` en la acción permite saltear el check (ej. Diego decide pisar).
async function _validarSinConflicto({ start, end, excluirEventoId, forzar }) {
  if (forzar) return;
  const conflictos = await g.buscarConflictos({ start, end, excluirEventoId });
  if (!conflictos.length) return;
  const detalle = conflictos.map(c => {
    const hh = c.allDay ? '(todo el día)' : `${c.start} → ${c.end}`;
    return `"${c.summary}" ${hh}`;
  }).join(' | ');
  throw new Error(`conflicto con evento(s) ya agendado(s): ${detalle}. Si Diego confirma pisar, reemití la acción con "forzar": true.`);
}

async function _crearEvento(a) {
  _requerir(a, ['summary', 'start', 'end']);
  await _validarSinConflicto({ start: a.start, end: a.end, forzar: a.forzar });
  const ev = await g.crearEvento({
    summary: a.summary,
    descripcion: a.descripcion || '',
    ubicacion: a.ubicacion || '',
    start: a.start,
    end: a.end,
    attendees: a.attendees || [],
    meet: a.meet,
  });
  mem.log({
    canal: 'calendar', direccion: 'saliente',
    cuerpo: `creado: ${ev.summary} (${ev.start} → ${ev.end})${ev.meetLink ? ' · Meet: ' + ev.meetLink : ''}`,
    metadata: { eventoId: ev.id, link: ev.link, meetLink: ev.meetLink },
  });
  return { id: ev.id, summary: ev.summary, link: ev.link, meetLink: ev.meetLink };
}

async function _modificarEvento(a) {
  _requerir(a, ['id']);
  if (a.start && a.end) {
    await _validarSinConflicto({ start: a.start, end: a.end, excluirEventoId: a.id, forzar: a.forzar });
  }
  const ev = await g.modificarEvento({
    id: a.id,
    summary: a.summary,
    descripcion: a.descripcion,
    ubicacion: a.ubicacion,
    start: a.start,
    end: a.end,
  });
  mem.log({
    canal: 'calendar', direccion: 'saliente',
    cuerpo: `modificado: ${ev.summary} (${ev.start} → ${ev.end})`,
    metadata: { eventoId: ev.id },
  });
  return { id: ev.id, summary: ev.summary };
}

async function _borrarEvento(a) {
  _requerir(a, ['id']);
  await g.borrarEvento({ id: a.id });
  mem.log({
    canal: 'calendar', direccion: 'saliente',
    cuerpo: `borrado: evento ${a.id}`,
    metadata: { eventoId: a.id },
  });
  return { id: a.id, borrado: true };
}

// ─── Gmail ────────────────────────────────────────────────────────────────

async function _responderEmail(a) {
  _requerir(a, ['messageId', 'texto']);
  await g.responderEmail(a.messageId, a.texto);
  mem.log({
    canal: 'gmail', direccion: 'saliente',
    asunto: `Re: ${a.asunto || ''}`,
    cuerpo: a.texto,
    metadata: { inReplyTo: a.messageId },
  });
  return { messageId: a.messageId, enviado: true };
}

// ─── WhatsApp ─────────────────────────────────────────────────────────────

// ¿El "a" de Claude apunta a Diego? Comparamos solo los dígitos — tolera
// +541..., 541...@c.us, 541..., etc.
function _esDiego(a) {
  const soloDig = String(a || '').replace(/\D/g, '');
  const diegoDig = DIEGO_WA_CUS.replace(/\D/g, '');
  return soloDig === diegoDig && soloDig.length > 0;
}

async function _enviarWA(a, ctx) {
  _requerir(a, ['a', 'texto']);
  if (!ctx.waClient) throw new Error('enviar_wa: ctx.waClient no fue provisto al executor');

  // Resolver destino: si apuntan a Diego por su número legacy, usar el @lid
  // capturado en runtime. Si falla con "No LID for user", reintentar con el lid.
  let destino = a.a;
  const apuntaADiego = _esDiego(a.a);
  if (apuntaADiego) {
    const lid = mem.getEstado('diego_wa_lid');
    if (lid) destino = lid;
  }

  try {
    await ctx.waClient.sendMessage(destino, a.texto);
  } catch (err) {
    const esLidError = /No LID for user|invalid wid|not.{0,10}registered/i.test(err.message || '');
    if (esLidError && apuntaADiego) {
      const lid = mem.getEstado('diego_wa_lid');
      if (lid && lid !== destino) {
        await ctx.waClient.sendMessage(lid, a.texto);
        destino = lid;
      } else {
        throw new Error(`No pude mandar WA a Diego (no tengo @lid capturado todavía — que Diego te mande un mensaje primero): ${err.message}`);
      }
    } else {
      throw err;
    }
  }

  mem.log({
    canal: 'whatsapp', direccion: 'saliente',
    de: destino, cuerpo: a.texto,
    metadata: { destinoOriginal: a.a, destinoFinal: destino },
  });
  return { a: destino, enviado: true };
}

// ─── Memoria (pendientes + contactos) ─────────────────────────────────────

function _agregarPendiente(a) {
  _requerir(a, ['desc']);
  mem.agregarPendiente(a.desc, a.meta || {});
  return { desc: a.desc, agregado: true };
}

function _quitarPendiente(a) {
  // Preferir `id` (estable). Legacy: `indice` 1-based o `desc` literal.
  if (a.id == null && a.desc == null && a.indice == null) {
    throw new Error('quitar_pendiente: pasá `id`, `desc` o `indice`');
  }
  let arg;
  if (typeof a.id === 'number') arg = a.id;
  else if (typeof a.desc === 'string') arg = a.desc;
  else arg = { indice: a.indice };

  const cerrado = mem.quitarPendiente(arg);
  if (!cerrado) {
    throw new Error(`quitar_pendiente: no encontré el pendiente (${a.id ?? a.desc ?? `indice=${a.indice}`})`);
  }
  return { id: cerrado.id, desc: cerrado.desc, cerrado: true };
}

function _programarMensaje(a) {
  _requerir(a, ['cuando', 'canal', 'destino', 'texto']);
  if (!['whatsapp', 'gmail'].includes(a.canal)) {
    throw new Error(`programar_mensaje: canal inválido (${a.canal})`);
  }
  // Resolver destino si es el @c.us legacy de Diego
  let destino = a.destino;
  if (a.canal === 'whatsapp' && _esDiego(destino)) {
    const lid = mem.getEstado('diego_wa_lid');
    if (lid) destino = lid;
  }
  const id = mem.programarMensaje({
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

function _cancelarProgramado(a) {
  _requerir(a, ['id']);
  mem.cancelarProgramado(a.id);
  return { id: a.id, cancelado: true };
}

function _recordarHecho(a) {
  _requerir(a, ['clave', 'valor']);
  mem.recordarHecho({ clave: a.clave, valor: a.valor, fuente: a.fuente || null });
  return { clave: a.clave, guardado: true };
}

function _olvidarHecho(a) {
  _requerir(a, ['clave']);
  mem.olvidarHecho(a.clave);
  return { clave: a.clave, olvidado: true };
}

function _upsertContacto(a) {
  _requerir(a, ['nombre']);
  const c = mem.upsertContacto({
    nombre: a.nombre,
    whatsapp: a.whatsapp || null,
    email: a.email || null,
    notas: a.notas || null,
  });
  return { id: c.id, nombre: c.nombre };
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function _requerir(obj, campos) {
  const faltan = campos.filter(k => obj[k] == null || obj[k] === '');
  if (faltan.length) throw new Error(`Faltan campos requeridos: ${faltan.join(', ')}`);
}

module.exports = { ejecutarAcciones };
