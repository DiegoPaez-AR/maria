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
const clima = require('./clima');
const seguridad = require('./seguridad');
const waSend = require('./wa-send');
const moderacion = require('./moderacion');

// ─── Gate de moderación de contenido saliente (2026-06-13) ───────────────
// Clasifica lo que Maria está por mandar a un tercero. Si es contenido
// prohibido (sexual, amenaza, acoso/coacción, armas/ilícito): NO envía,
// loggea evento de seguridad, avisa al owner (rate-limited) y tira error
// para que el LLM le diga al usuario "No puedo enviar eso". FAIL-OPEN: si el
// clasificador falla, deja pasar (la capa de prompt ya filtró lo peor).
const _ultimoAvisoOwnerMod = { ts: 0 };
const _AVISO_OWNER_MOD_MS = Number(process.env.MARIA_MOD_AVISO_THROTTLE_MS || 5 * 60 * 1000);

async function _avisarOwnerModeracion(ctx, { categoria, severidad, motivo, destino, texto }) {
  try {
    const owner = usuarios.obtenerOwner();
    if (!owner || !ctx.waClient) return;
    const ahora = Date.now();
    if (ahora - _ultimoAvisoOwnerMod.ts < _AVISO_OWNER_MOD_MS) return; // throttle anti-flood
    _ultimoAvisoOwnerMod.ts = ahora;
    const dest = owner.wa_lid || owner.wa_cus;
    if (!dest) return;
    const quien = ctx.usuario ? `${ctx.usuario.nombre}${usuarios.esOwner(ctx.usuario.id) ? ' (owner)' : ''}` : '?';
    await waSend.enviarWADirecto(ctx.waClient, dest,
      `🚫 Bloqueé un envío por contenido inapropiado.\n\n` +
      `Usuario: ${quien}\nCategoría: ${categoria || '?'} (${severidad || '?'})\n` +
      `Destino: ${destino || '?'}\nMotivo: ${motivo || '-'}\n\n` +
      `Texto: "${String(texto || '').slice(0, 300)}"`,
      { tag: 'moderacion_aviso', usuarioId: owner.id });
  } catch (err) {
    console.warn('[moderacion] aviso owner falló:', err.message);
  }
}

// Gate de turno-de-tercero (2026-07-02, review 0701): en un turno disparado
// por un NO-usuario, los envíos hacia afuera (enviar_email/reenviar_wa) solo
// pueden ir al propio usuario atendido. Corta la cadena de exfiltración
// "tercero persuade a Maria de reenviarle la agenda/mails a un destino suyo".
// La respuesta conversacional al tercero va por el slot respuesta_a_remitente
// (no pasa por acá) y responder_email al hilo sigue permitido.
function _esDestinoUsuario(destino, usuario, canal) {
  if (!destino || !usuario) return false;
  if (canal === 'email') return String(destino).toLowerCase().trim() === String(usuario.email || '').toLowerCase().trim() && !!usuario.email;
  const d = String(destino).replace(/\D/g, '');
  const u = String(usuario.wa_cus || '').replace(/\D/g, '');
  if (destino === usuario.wa_lid) return true;
  return d.length >= 8 && u.length >= 8 && (d.endsWith(u) || u.endsWith(d));
}
function _gateTercero(ctx, accionTipo, destinos, canal) {
  if (!ctx.turnoDeTercero) return;
  for (const dst of destinos) {
    if (!_esDestinoUsuario(dst, ctx.usuario, canal)) {
      try {
        mem.logSecurityEvent({
          usuarioId: ctx.usuario?.id || null, canal: accionTipo,
          motivo: `gate_tercero: ${accionTipo} hacia "${dst}" bloqueado en turno de tercero`,
          body: '', extra: { destino: dst },
        });
      } catch {}
      throw new Error(`${accionTipo}: este turno lo inició un tercero — solo puedo enviar a ${ctx.usuario.nombre}. Si el pedido es legítimo, consultale primero al usuario (respuesta_a_usuario) y que él lo pida.`);
    }
  }
}

async function _moderarSaliente(texto, a, ctx, accionTipo, destino) {
  const r = await moderacion.revisarSaliente(texto);
  if (r.bloquear) {
    try {
      mem.logSecurityEvent({
        usuarioId: ctx.usuario ? ctx.usuario.id : null,
        canal: accionTipo,
        motivo: `contenido bloqueado (${r.categoria}/${r.severidad}): ${r.motivo || ''}`,
        body: texto,
        extra: { tipo_mod: 'saliente_bloqueado', categoria: r.categoria, severidad: r.severidad, destino },
      });
    } catch {}
    await _avisarOwnerModeracion(ctx, { categoria: r.categoria, severidad: r.severidad, motivo: r.motivo, destino, texto });
    throw new Error(`${accionTipo}: no puedo enviar ese contenido (política de moderación). Decile al usuario "No puedo enviar eso" sin más detalle.`);
  }
}

const providers = require('./providers');
const waValidate = require('./wa-validate');
const vault = require('./vault');
const microsoftProvider = require('./providers/microsoft');

/**
 * Ejecuta acciones. ctx debe traer: { usuario, waClient, canalOrigen }.
 */
// Normaliza saltos/tabs LITERALES (\n, \t) que el modelo a veces sobre-escapa
// en el texto de un tool/acción, para que no salgan como "\n" crudos al
// destinatario. Solo toca secuencias de escape literales; texto normal intacto.
function _normNL(t) {
  if (typeof t !== 'string') return t;
  return t.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\r/g, '');
}

async function ejecutarAcciones(acciones = [], ctx = {}, _opts = {}) {
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

  // Repair round-trip eliminado 2026-07-03: con acciones como tools MCP el
  // nombre lo garantiza el schema — el drift que reparaba es imposible.

  return resultados;
}

// Fuente ÚNICA de nombres de acción: action-schemas.js (los tools MCP).
// Paridad verificada 32=32 con el switch el 2026-07-03 al derivarla.
const ACCIONES_VALIDAS = require('./action-schemas').TOOLS.map(t => t.name);

// Toda la maquinaria de tolerancia a drift de nombres (levenshtein, sinónimos,
// auto-ruteo por payload, alias) se eliminó el 2026-07-03: con tools MCP el
// nombre viene del schema y no puede driftear. Historia en git (branch
// pre-legacy-cleanup) y en [[project_maria_action_drift]].

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
    case 'posponer_pendiente': return _posponerPendiente(accion, ctx);
    case 'upsert_contacto':    return _upsertContacto(accion, ctx);
    case 'cambiar_visibilidad_contacto': return _cambiarVisibilidadContacto(accion, ctx);
    case 'set_cumple_contacto':          return _setCumpleContacto(accion, ctx);
    case 'programar_mensaje':  return await _programarMensaje(accion, ctx);
    case 'cancelar_programado':return _cancelarProgramado(accion, ctx);
    case 'crear_follow_up':    return _crearFollowUp(accion, ctx);
    case 'cerrar_follow_up':   return _cerrarFollowUp(accion, ctx);
    case 'recordar_hecho':     return _recordarHecho(accion, ctx);
    case 'olvidar_hecho':      return _olvidarHecho(accion, ctx);
    case 'vincular_telegram': {
      // Canal Telegram de respaldo (2026-07-03): genera código one-shot 15min.
      const _vinc = require('./telegram-vinculos');
      if (!process.env.TELEGRAM_BOT_TOKEN) {
        throw new Error('vincular_telegram: el canal Telegram no está configurado en esta instancia');
      }
      const _cod = _vinc.generar(ctx.usuario.id);
      const _uname = String(process.env.TELEGRAM_BOT_USERNAME || '').replace(/^@/, '');
      const _link = _uname ? `https://t.me/${_uname}` : null;
      return {
        codigo: _cod,
        link: _link,
        instrucciones: (_link
          ? `Entrá a ${_link}, tocá "Iniciar" y después el botón "📱 Compartir mi número" — un tap y quedás vinculado (tiene que ser el mismo número que tu WhatsApp). Si tu Telegram usa OTRO número, mandale este código en su lugar: ${_cod} (vale 15 minutos).`
          : `Mandale el código ${_cod} al bot de Telegram de Maria dentro de los próximos 15 minutos.`),
      };
    }
    case 'configurar_brief':  return _configurarBrief(accion, ctx);
    case 'configurar_ubicacion': return _configurarUbicacion(accion, ctx);
    case 'crear_usuario':      return _crearUsuario(accion, ctx);
    case 'actualizar_usuario': return _actualizarUsuario(accion, ctx);
    case 'borrar_usuario':     return _borrarUsuario(accion, ctx);
    case 'configurar_caldav': return await _configurarCaldav(accion, ctx);
    case 'iniciar_microsoft_auth': return await _iniciarMicrosoftAuth(accion, ctx);
    case 'configurar_microsoft': return await _configurarMicrosoft(accion, ctx);
    case 'set_calendar_acceso': return await _setCalendarAcceso(accion, ctx);
    case 'buscar_contacto_global': return _buscarContactoGlobal(accion, ctx);
    case 'buscar_slots_comunes':   return await _buscarSlotsComunes(accion, ctx);
    case 'confirmar_prospecto_pendiente':
      return _confirmarProspectoPendiente(accion, ctx);
    case 'rechazar_prospecto_pendiente':
      return _rechazarProspectoPendiente(accion, ctx);
    default:
      throw new Error(
        `Acción desconocida: "${accion.tipo}". Debe ser EXACTAMENTE uno de: ${ACCIONES_VALIDAS.join(', ')}.`
      );
  }
}

// ─── Calendar ─────────────────────────────────────────────────────────────

async function _validarSinConflicto(provider, { start, end, excluirEventoId, forzar, calendarId }) {
  if (forzar) return;
  const conflictos = await provider.buscarConflictos({ start, end, excluirEventoId, calendarId });
  if (!conflictos.length) return;
  const detalle = conflictos.map(c => {
    const hh = c.allDay ? '(todo el día)' : `${c.start} → ${c.end}`;
    return `"${c.summary}" ${hh}`;
  }).join(' | ');
  throw new Error(`conflicto con evento(s) ya agendado(s): ${detalle}. Si el usuario confirma pisar, reemití con "forzar": true.`);
}

// Cruza calendars de varios usuarios activos y devuelve slots libres comunes.
// Solo aplica a usuarios actuales de Maria (los users que comparten calendar).
// Para sumar terceros, el LLM tiene que invitarlos por email/WA aparte.
async function _buscarSlotsComunes(a, ctx) {
  _requerir(a, ['usuarios']);
  const nombres = Array.isArray(a.usuarios) ? a.usuarios : [];
  if (nombres.length < 1) {
    throw new Error('buscar_slots_comunes: lista `usuarios` vacía');
  }
  const duracionMin = Math.max(15, Math.min(8 * 60, Number(a.duracion_min) || 60));
  const ventanaDias = Math.max(1, Math.min(30, Number(a.ventana_dias) || 7));
  const horaIni = Math.max(0, Math.min(23, Number(a.hora_desde) || 9));
  const horaFin = Math.max(horaIni + 1, Math.min(24, Number(a.hora_hasta) || 19));
  const slotMin = 30; // granularidad

  // Resolver lista de usuarios. Cada nombre tiene que matchear con usuarios.resolverPorNombre.
  const usuariosResueltos = [];
  const noEncontrados = [];
  const sinCalendar = [];
  for (const nombre of nombres) {
    const u = usuarios.resolverPorNombre(nombre);
    if (!u) { noEncontrados.push(nombre); continue; }
    const tier = usuarios.tier(u);
    if (tier === 'tier_0' && !u.email) {
      // Sin acceso al calendar y sin email para invitar = no podemos cruzar
      sinCalendar.push(`${u.nombre} (sin acceso a calendar)`);
      continue;
    }
    usuariosResueltos.push(u);
  }
  if (!usuariosResueltos.length) {
    throw new Error(`buscar_slots_comunes: no resolví ningún usuario válido. No encontrados: [${noEncontrados.join(', ')}]; sin calendar: [${sinCalendar.join(', ')}]`);
  }

  // Bajar eventos de cada usuario en la ventana
  const tz = ctx.usuario?.tz || 'America/Argentina/Buenos_Aires';
  const ahora = new Date();
  const fin = new Date(ahora.getTime() + ventanaDias * 24 * 3600 * 1000);
  const busyPorUsuario = [];
  for (const u of usuariosResueltos) {
    try {
      const provider = await providers.forUser(u);
      const eventos = await provider.listarEventosDelUsuario(u, { dias: ventanaDias, max: 200 });
      const busy = (eventos || [])
        .filter(e => !e.allDay && e.start && e.end)
        .map(e => ({ start: new Date(e.start).getTime(), end: new Date(e.end).getTime() }));
      busyPorUsuario.push({ usuario: u.nombre, busy });
    } catch (err) {
      busyPorUsuario.push({ usuario: u.nombre, busy: [], error: err.message });
    }
  }

  // Generar candidatos de slots dentro de la ventana laboral.
  // Iteramos en granularidad de slotMin minutos y chequeamos overlap con todos los busy.
  const slotMs = slotMin * 60 * 1000;
  const durMs = duracionMin * 60 * 1000;
  const slotsLibres = [];

  // Helper: ¿este slot [s, s+durMs) está libre para TODOS los usuarios?
  const estaLibre = (s) => {
    const e = s + durMs;
    for (const { busy } of busyPorUsuario) {
      for (const b of busy) {
        // overlap si b.start < e AND b.end > s
        if (b.start < e && b.end > s) return false;
      }
    }
    return true;
  };

  // Iterar día por día, hora por hora en la ventana laboral local
  for (let d = 0; d < ventanaDias; d++) {
    const dia = new Date(ahora.getTime() + d * 24 * 3600 * 1000);
    // Construir hora local de inicio (horaIni:00) en tz del owner
    // Usamos toLocaleString + Date parsing en local. Simple: setHours en local.
    const inicio = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate(), horaIni, 0, 0, 0);
    const cierre = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate(), horaFin, 0, 0, 0);
    for (let t = inicio.getTime(); t + durMs <= cierre.getTime(); t += slotMs) {
      if (t < ahora.getTime() + 60 * 60 * 1000) continue; // saltear pasado + próxima hora
      if (estaLibre(t)) {
        slotsLibres.push({ start: new Date(t).toISOString(), end: new Date(t + durMs).toISOString() });
        if (slotsLibres.length >= 15) break;
      }
    }
    if (slotsLibres.length >= 15) break;
  }

  return {
    usuarios: usuariosResueltos.map(u => u.nombre),
    duracion_min: duracionMin,
    ventana_dias: ventanaDias,
    hora_desde: horaIni,
    hora_hasta: horaFin,
    no_encontrados: noEncontrados,
    sin_calendar: sinCalendar,
    slots: slotsLibres,
    total_eventos_chequeados: busyPorUsuario.reduce((s, x) => s + x.busy.length, 0),
  };
}

async function _crearEvento(a, ctx) {
  _requerir(a, ['summary', 'start', 'end']);

  // para_usuario_id (snake) / para_usuarioId (camel): cuando el evento se
  // crea PARA otro usuario (típico: owner agendando para un asistido), el
  // executor usa el tier del beneficiario para decidir el calendarId. Solo
  // el owner puede dirigir un evento a otro usuario.
  const targetId = a.para_usuario_id ?? a.para_usuarioId ?? null;
  let u = ctx.usuario;
  if (targetId != null && targetId !== ctx.usuario.id) {
    if (!usuarios.esOwner(ctx.usuario.id)) {
      throw new Error('crear_evento: solo el owner puede crear eventos para otro usuario (para_usuario_id)');
    }
    const t = usuarios.obtener(targetId);
    if (!t) throw new Error(`crear_evento: para_usuario_id=${targetId} no existe`);
    u = t;
  }
  const tier = usuarios.tier(u);
  const provider = await providers.forUser(u);

  // Decidir contra qué calendar crear:
  //   tier_2 → calendar del user (autonomía total).
  //   tier_1 → calendar de Maria + chequea conflictos en calendar del user.
  //   tier_0 → calendar de Maria, sin chequeo (no tenemos visibilidad).
  // En tier 0/1 sumamos al user como attendee para que reciba el invite.
  const enCalDelUsuario = tier === 'tier_2';
  const calendarId = enCalDelUsuario
    ? u.calendar_id
    : await provider.getMariaCalendarId();

  // Si no es en su propio calendar y el user no tiene email, no podemos invitarlo.
  if (!enCalDelUsuario && !u.email) {
    throw new Error(`crear_evento: ${u.nombre} no tiene calendar de escritura ni email registrado — no puedo agendarle nada. Pedile el email primero.`);
  }

  // Conflicto: chequeamos contra el calendar del user si tenemos lectura.
  if (tier === 'tier_2' || tier === 'tier_1') {
    await _validarSinConflicto(provider, { start: a.start, end: a.end, forzar: a.forzar, calendarId: u.calendar_id });
  }

  // Attendees: en tier 0/1 sumamos al user automáticamente (para que reciba
  // el invite). En tier 2 NO hace falta porque el evento ya está en su calendar.
  const attendeesFinal = (a.attendees || []).slice();
  if (!enCalDelUsuario && u.email) {
    const yaInvitado = attendeesFinal.some(em => String(em).toLowerCase() === u.email.toLowerCase());
    if (!yaInvitado) attendeesFinal.push(u.email);
  }

  const ev = await provider.crearEvento({
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
  const provider = await providers.forUser(u);

  // Resolver contra qué calendar trabajar. En tier 0/1 los eventos creados
  // por Maria viven en su calendar; en tier 2 están en el del user.
  // a.calendarId opcional permite override desde el LLM si supiera el path.
  const calendarId = a.calendarId
    || (tier === 'tier_2' ? u.calendar_id : await provider.getMariaCalendarId());

  // Tier 1: si el evento NO fue creado por Maria, NO podemos modificarlo
  // (sin write access). Bloqueamos con un error claro.
  if (tier === 'tier_1') {
    try {
      const ev = await provider.obtenerEvento({ id: a.id, calendarId });
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
      await _validarSinConflicto(provider, { start: a.start, end: a.end, excluirEventoId: a.id, forzar: a.forzar, calendarId: u.calendar_id });
    }
  }

  const ev = await provider.modificarEvento({
    id: a.id,
    summary: a.summary,
    descripcion: a.descripcion,
    ubicacion: a.ubicacion,
    start: a.start,
    end: a.end,
    attendees: a.attendees,
    calendarId,
  });
  // Verificación: confirmar que los cambios pedidos quedaron aplicados (el `ev`
  // devuelto es el estado post-modificación). Cubre el caso "acción OK pero el
  // campo no se escribió". Si algo no se aplicó, fallamos para que el usuario
  // reciba un aviso honesto en vez de una confirmación falsa.
  const _noAplicado = [];
  if (a.ubicacion && !String(ev.ubicacion || '').toLowerCase().includes(String(a.ubicacion).toLowerCase().slice(0, 15))) {
    _noAplicado.push('la ubicación');
  }
  if (a.summary && ev.summary && String(ev.summary).trim() !== String(a.summary).trim()) {
    _noAplicado.push('el título');
  }
  if (_noAplicado.length) {
    throw new Error(`modificar_evento: la acción corrió pero NO se aplicó ${_noAplicado.join(' ni ')} al evento ${a.id}. Reintentá asegurándote de incluir el campo correcto.`);
  }
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
  const provider = await providers.forUser(u);
  const calendarId = a.calendarId
    || (tier === 'tier_2' ? u.calendar_id : await provider.getMariaCalendarId());

  // Tier 1: bloquear borrado si el organizer no es Maria.
  if (tier === 'tier_1') {
    try {
      const ev = await provider.obtenerEvento({ id: a.id, calendarId });
      const organizer = (ev?.organizerEmail || '').toLowerCase();
      const meEmail = (g.MARIA_EMAIL || '').toLowerCase();
      if (organizer && organizer !== meEmail) {
        throw new Error(`borrar_evento: este evento (${a.id}) lo creó ${organizer} (no yo); no tengo permiso de escritura para borrarlo. ${u.nombre} tiene que borrarlo desde su lado.`);
      }
    } catch (err) {
      if (err.message?.startsWith('borrar_evento:')) throw err;
    }
  }

  await provider.borrarEvento({ id: a.id, calendarId });
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
  a.texto = _normNL(a.texto);
  // Capa 3 — validar que el messageId corresponde a un email que efectivamente
  // recibimos. Previene que un LLM jailbroken o un caller malicioso invente un
  // messageId y mande a un thread arbitrario.
  if (process.env.SEC_RESPONDER_EMAIL_STRICT !== 'false') {
    // Scope por usuario: que un usuario no pueda responder un thread que
    // recibió OTRO usuario (los buckets de gmail entrante son por usuario).
    // El owner mantiene alcance global.
    const scope = usuarios.esOwner(ctx.usuario.id) ? null : ctx.usuario.id;
    if (!mem.existeEmailEntrante(a.messageId, scope)) {
      throw new Error(`responder_email: messageId "${a.messageId}" no corresponde a ningún email recibido. Si querés mandar un email NUEVO, usá enviar_email.`);
    }
  }
  // Capa 3 también para el override de cc (mismo criterio que enviar_email).
  if (a.cc) {
    const ccs = Array.isArray(a.cc) ? a.cc : [a.cc];
    for (const t of ccs) {
      const v = seguridad.validarDestinatario({ usuario: ctx.usuario, canal: 'email', destino: t });
      if (!v.ok) throw new Error(`responder_email: cc inválido — ${v.motivo}.`);
    }
  }
  await _moderarSaliente(a.texto, a, ctx, 'responder_email', a.messageId);
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
  a.texto = _normNL(a.texto);
  // Validar destinatarios contra libreta visible / usuarios activos.
  // TODOS los campos de destino: cc/bcc/replyTo sin validar eran un canal
  // de exfiltración (to legítimo + bcc del atacante) — fix 2026-06-09.
  const tos  = Array.isArray(a.to)  ? a.to  : [a.to];
  const ccs  = a.cc  ? (Array.isArray(a.cc)  ? a.cc  : [a.cc])  : [];
  const bccs = a.bcc ? (Array.isArray(a.bcc) ? a.bcc : [a.bcc]) : [];
  const replyTos = a.replyTo ? [a.replyTo] : [];
  for (const t of [...tos, ...ccs, ...bccs, ...replyTos]) {
    const v = seguridad.validarDestinatario({ usuario: ctx.usuario, canal: 'email', destino: t });
    if (!v.ok) throw new Error(`enviar_email: ${v.motivo}. Cargá el contacto primero (upsert_contacto) o pedile al usuario que confirme.`);
  }
  _gateTercero(ctx, 'enviar_email', [...tos, ...ccs, ...bccs, ...replyTos], 'email');

  await _moderarSaliente(`${a.asunto || ''}\n${a.texto || ''}`, a, ctx, 'enviar_email', Array.isArray(a.to) ? a.to.join(',') : a.to);
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
  const _v = seguridad.validarDestinatario({ usuario: ctx.usuario, canal: 'wa', destino: a.a });
  if (!_v.ok) throw new Error(`reenviar_wa: ${_v.motivo}.`);
  _gateTercero(ctx, 'reenviar_wa', [a.a], 'wa');
  const destino = _resolverDestinoWA(a.a);
  let original;
  try {
    original = await ctx.waClient.getMessageById(a.messageId);
  } catch (err) {
    throw new Error(`reenviar_wa: no encontré mensaje ${a.messageId}: ${err.message}`);
  }
  if (!original) throw new Error(`reenviar_wa: mensaje ${a.messageId} no existe (puede haber sido purgado)`);
  // Best-effort: si el mensaje a reenviar tiene texto/caption, lo moderamos.
  // (Media binaria sin texto no se clasifica acá.)
  const _bodyFwd = (original && (original.body || original.caption)) ? String(original.body || original.caption) : '';
  if (_bodyFwd.trim()) await _moderarSaliente(_bodyFwd, a, ctx, 'reenviar_wa', a.a);
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
 * Resuelve un destino WA crudo (un string que puede ser @c.us o @lid) a
 * la mejor opción de entrega. Delega al helper común en wa-send.js para
 * mantener una sola implementación.
 */
function _resolverDestinoWA(a) {
  return waSend.resolverPorPersistencia(a);
}

async function _enviarWA(a, ctx) {
  _requerir(a, ['a', 'texto']);
  a.texto = _normNL(a.texto);
  if (!ctx.waClient) throw new Error('enviar_wa: ctx.waClient no fue provisto al executor');

  // Validar destinatario contra libreta visible / usuarios activos.
  const _v = seguridad.validarDestinatario({ usuario: ctx.usuario, canal: 'wa', destino: a.a });
  if (!_v.ok) throw new Error(`enviar_wa: ${_v.motivo}. Cargá el contacto primero (upsert_contacto) o pedile al usuario que confirme.`);

  await _moderarSaliente(a.texto, a, ctx, 'enviar_wa', a.a);

  let destinoFinal;
  try {
    const r = await waSend.enviarWADirecto(ctx.waClient, a.a, a.texto, {
      tag: 'enviar_wa',
      usuarioId: ctx.usuario.id,
      metadata: { destinoOriginal: a.a },
      // Solo difiero las notificaciones que dispara un mail entrante de noche
      // (canalOrigen='gmail'). Lo que el usuario pide en vivo (canalOrigen
      // 'whatsapp') o el maria-worker (ya 08-22) sale siempre.
      diferible: ctx.canalOrigen === 'gmail',
      tz: ctx.usuario.tz,
    });
    if (r.diferido) return { a: a.a, enviado: false, diferido: true };
    destinoFinal = r.destinoFinal;
  } catch (err) {
    throw new Error(`No pude mandar WA a ${a.a}: ${err.message}`);
  }
  return { a: destinoFinal, enviado: true };
}

// ─── Memoria (pendientes + contactos + programados + hechos) ─────────────

function _agregarPendiente(a, ctx) {
  _requerir(a, ['desc', 'dueno', 'disparador']);
  // dueno/disparador van en la raíz de la acción. El resto de meta queda libre.
  const meta = { ...(a.meta || {}), dueno: a.dueno, disparador: a.disparador };

  // Red de seguridad automática: si Maria crea un pendiente trigger_externo
  // esperando la respuesta de un TERCERO (meta.esperando_de), le enganchamos
  // un follow_up. Si el tercero no responde antes del vencimiento, el loop de
  // follow-ups le avisa al usuario. Determinístico: no depende de que el LLM
  // se acuerde de emitir crear_follow_up aparte (que es justo lo que falla).
  let followUp = null;
  if (a.dueno === 'maria' && a.disparador === 'trigger_externo' && a.meta && a.meta.esperando_de) {
    const canal = a.meta.esperando_canal === 'gmail' ? 'gmail' : 'whatsapp';
    const _v = seguridad.validarDestinatario({
      usuario: ctx.usuario,
      canal: canal === 'whatsapp' ? 'wa' : 'email',
      destino: a.meta.esperando_de,
    });
    if (_v.ok) {
      let dias = Number(a.meta.vence_en_dias);
      if (!Number.isFinite(dias) || dias < 0 || dias > 365) dias = 2; // default 2 días
      const vence = new Date(Date.now() + dias * 24 * 3600 * 1000);
      const venceISO = vence.toISOString().replace('T', ' ').slice(0, 19);
      try {
        const fuId = mem.crearFollowUp({
          usuarioId: ctx.usuario.id,
          descripcion: a.desc,
          esperandoDe: a.meta.esperando_de,
          esperandoCanal: canal,
          venceEn: venceISO,
          metadata: { origen: 'auto_pendiente' },
        });
        meta.follow_up_id = fuId;
        followUp = { id: fuId, vence_en: venceISO, esperando_de: a.meta.esperando_de };
      } catch (err) {
        console.warn(`[agregar_pendiente] auto follow_up falló: ${err.message}`);
      }
    } else {
      console.warn(`[agregar_pendiente] no creo follow_up auto (${a.meta.esperando_de}): ${_v.motivo}`);
    }
  }

  const id = mem.agregarPendiente(ctx.usuario.id, a.desc, meta);
  return { id, desc: a.desc, dueno: a.dueno, disparador: a.disparador, agregado: true, follow_up: followUp };
}

function _posponerPendiente(a, ctx) {
  _requerir(a, ['id', 'hasta']);
  const hastaISO = _resolverHasta(a.hasta, ctx);
  const r = mem.posponerPendiente(ctx.usuario.id, a.id, hastaISO);
  if (!r) throw new Error(`posponer_pendiente: no encontré el pendiente id=${a.id} (o no es tuyo)`);
  return { id: r.id, recordar_desde: r.recordar_desde, pospuesto: true };
}

// Acepta ISO 8601 absoluto o offset relativo ("+3h", "+30m", "+1d").
// Cualquier otra cosa, error explícito.
function _resolverHasta(valor, _ctx) {
  if (typeof valor !== 'string' || !valor.trim()) {
    throw new Error('posponer_pendiente: hasta debe ser ISO 8601 o offset ("+3h","+30m","+1d")');
  }
  const v = valor.trim();
  const mRel = v.match(/^\+(\d+)(m|h|d)$/);
  if (mRel) {
    const n = Number(mRel[1]);
    const mult = mRel[2] === 'm' ? 60_000 : mRel[2] === 'h' ? 3_600_000 : 86_400_000;
    return new Date(Date.now() + n * mult).toISOString();
  }
  const t = new Date(v).getTime();
  if (isNaN(t)) {
    throw new Error(`posponer_pendiente: hasta no parsea (${v}). Usá ISO 8601 ("2026-05-19T19:00:00Z") o offset ("+3h").`);
  }
  return new Date(t).toISOString();
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

async function _programarMensaje(a, ctx) {
  _requerir(a, ['cuando', 'canal', 'destino', 'texto']);
  a.texto = _normNL(a.texto);
  if (!['whatsapp', 'gmail'].includes(a.canal)) {
    throw new Error(`programar_mensaje: canal inválido (${a.canal})`);
  }
  const _canalSec = a.canal === 'gmail' ? 'email' : 'wa';
  const _v = seguridad.validarDestinatario({ usuario: ctx.usuario, canal: _canalSec, destino: a.destino });
  if (!_v.ok) throw new Error(`programar_mensaje: ${_v.motivo}.`);
  await _moderarSaliente(`${a.asunto || ''}\n${a.texto || ''}`, a, ctx, 'programar_mensaje', a.destino);
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
  // Scope por usuario (los ids son secuenciales y adivinables). Owner: global.
  const scope = usuarios.esOwner(ctx.usuario.id) ? null : ctx.usuario.id;
  const ok = mem.cancelarProgramado(a.id, scope);
  if (!ok) throw new Error(`cancelar_programado: id=${a.id} no existe o no es un programado de ${ctx.usuario.nombre}.`);
  return { id: a.id, cancelado: true };
}

function _crearFollowUp(a, ctx) {
  _requerir(a, ['descripcion', 'esperando_de', 'vence_en_dias']);
  const dias = Number(a.vence_en_dias);
  if (!Number.isFinite(dias) || dias < 0 || dias > 365) {
    throw new Error(`crear_follow_up: vence_en_dias debe ser número 0..365 (recibí ${a.vence_en_dias})`);
  }
  const canal = a.esperando_canal || 'whatsapp';
  if (!['whatsapp', 'gmail'].includes(canal)) {
    throw new Error(`crear_follow_up: esperando_canal inválido "${canal}" (usar whatsapp|gmail)`);
  }
  // Validar destino con el mismo criterio que enviar_wa: tiene que estar
  // en libreta o ser un hilo activo. Esto evita follow-ups a destinos
  // arbitrarios que después no podríamos contactar.
  const _v = seguridad.validarDestinatario({
    usuario: ctx.usuario,
    canal: canal === 'whatsapp' ? 'wa' : 'email',
    destino: a.esperando_de,
  });
  if (!_v.ok) {
    throw new Error(`crear_follow_up: ${_v.motivo}. Cargá el contacto primero o esperá a que ${a.esperando_de} te escriba.`);
  }
  // vence_en = now + dias (UTC)
  const vence = new Date(Date.now() + dias * 24 * 3600 * 1000);
  const venceISO = vence.toISOString().replace('T', ' ').slice(0, 19);
  const id = mem.crearFollowUp({
    usuarioId: ctx.usuario.id,
    descripcion: a.descripcion,
    esperandoDe: a.esperando_de,
    esperandoCanal: canal,
    venceEn: venceISO,
    metadata: a.metadata || null,
  });
  return { id, vence_en: venceISO, esperando_de: a.esperando_de };
}

function _cerrarFollowUp(a, ctx) {
  _requerir(a, ['id']);
  // Scope por usuario (ids secuenciales). Owner: global.
  const scope = usuarios.esOwner(ctx.usuario.id) ? null : ctx.usuario.id;
  const ok = mem.setFollowUpEstado(a.id, 'cerrado', scope);
  if (!ok) throw new Error(`cerrar_follow_up: id=${a.id} no existe o no es un follow-up de ${ctx.usuario.nombre}.`);
  return { id: a.id, cerrado: true };
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

async function _upsertContacto(a, ctx) {
  _requerir(a, ['nombre']);
  // Detección de candidatos a duplicado (2026-07-03, pedido Diego: "que no
  // deje subir duplicados, que pregunte"). El match por nombre EXACTO sigue
  // siendo el camino legítimo de actualización (silencioso). Lo que se frena:
  // mismo email/teléfono bajo OTRO nombre, o mismo nombre con tildes/espacios
  // distintos (el caso Rubén/Ruben Ward). forzar_nuevo:true saltea el check.
  if (!a.forzar_nuevo) {
    const _norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
    const _dig = s => String(s || '').replace(/\D/g, '');
    const nombreNorm = _norm(a.nombre);
    const emailNorm = a.email ? String(a.email).toLowerCase().trim() : null;
    const telSuf = _dig(a.whatsapp).slice(-10) || null;
    const sospechosos = [];
    for (const c of mem.todosLosContactos(ctx.usuario.id)) {
      const esExacto = String(c.nombre).toLowerCase() === String(a.nombre).toLowerCase();
      if (esExacto) continue; // update legítimo, lo maneja el upsert
      const motivos = [];
      if (emailNorm && c.email && String(c.email).toLowerCase().trim() === emailNorm) motivos.push('mismo email');
      if (telSuf && telSuf.length >= 8 && _dig(c.whatsapp).slice(-10) === telSuf) motivos.push('mismo teléfono');
      if (_norm(c.nombre) === nombreNorm) motivos.push('mismo nombre (variante de tildes/espacios)');
      if (motivos.length) sospechosos.push({ c, motivos });
    }
    if (sospechosos.length) {
      const detalle = sospechosos.slice(0, 3).map(({ c, motivos }) =>
        `"${c.nombre}" (${[c.whatsapp, c.email, c.cumple ? `cumple ${c.cumple}` : null].filter(Boolean).join(', ') || 'sin datos'}) — ${motivos.join(' + ')}`
      ).join(' · ');
      throw new Error(
        `upsert_contacto: posible DUPLICADO de un contacto existente: ${detalle}. ` +
        `NO lo creé. Preguntale al usuario qué hacer: (1) si es la MISMA persona, ` +
        `¿actualizo la ficha existente con los datos nuevos, dejo la vieja como está, o piso todo? ` +
        `— para actualizar, reemití upsert_contacto usando el nombre EXACTO existente; ` +
        `(2) si es OTRA persona, reemití con forzar_nuevo: true y un nombre que la distinga (apellido/empresa).`
      );
    }
  }
  // Si viene whatsapp, validar con getNumberId antes de guardar — evita
  // guardar wids armados con prefijo país errado (caso Enrique 2026-05-10).
  // El validador devuelve el wid resuelto por WA Web (puede ser @c.us o @lid).
  let waNorm = null;
  if (a.whatsapp) {
    try {
      waNorm = await waValidate.normalizarWaCus(a.whatsapp, ctx.waClient);
    } catch (err) {
      // No perdemos un número que el usuario nos dio: si WhatsApp no lo pudo
      // verificar (getNumberId transitorio, número fuera de cache, etc.), lo
      // guardamos igual en formato <digitos>@c.us. El envío real es la prueba:
      // si el número está mal, enviar_wa falla y se avisa honesto (en vez de
      // descartar en silencio un número válido y dejar el contacto inservible).
      const dig = String(a.whatsapp).replace(/[^\d]/g, '');
      if (dig) {
        waNorm = `${dig}@c.us`;
        console.warn(`[upsert_contacto] no pude verificar "${a.whatsapp}" (${err.message}); guardo ${waNorm} sin verificar`);
      } else {
        throw err;
      }
    }
  }
  const visibilidad = a.visibilidad === 'publica' ? 'publica' : 'privada';
  const c = mem.upsertContacto({
    usuarioId: ctx.usuario.id,
    nombre: a.nombre,
    whatsapp: waNorm,
    email: a.email || null,
    notas: a.notas || null,
    visibilidad,
    cumple: a.cumple || null,
  });
  // Enriquecimiento web (rol/empresa) en background: NO bloquea el turno. Si el
  // contacto tiene email, buscamos su perfil y lo guardamos en perfil_web para
  // que el meeting-prep y el prompt lo tengan listo. Fire-and-forget.
  if (c && c.id && a.email) {
    require('./enriquecer-contacto')
      .enriquecerContacto(ctx.usuario.id, { id: c.id, nombre: c.nombre, email: a.email })
      .catch(err => console.warn('[upsert_contacto] enriquecer falló:', err.message));
  }
  return { id: c.id, nombre: c.nombre, visibilidad: c.visibilidad, cumple: c.cumple };
}

// Cualquier usuario puede flippear visibilidad de un contacto al que tenga
// acceso (privado propio o público). Si toca un privado de otro usuario
// memory.js tira error.
function _cambiarVisibilidadContacto(a, ctx) {
  if (!a.contactoId && !a.nombre && !a.whatsapp && !a.email) {
    throw new Error('cambiar_visibilidad_contacto: pasá contactoId o nombre/whatsapp/email');
  }
  if (a.visibilidad !== 'privada' && a.visibilidad !== 'publica') {
    throw new Error(`cambiar_visibilidad_contacto: visibilidad inválida "${a.visibilidad}"`);
  }
  const c = mem.cambiarVisibilidadContacto({
    usuarioId: ctx.usuario.id,
    contactoId: a.contactoId || null,
    nombre: a.nombre || null,
    whatsapp: a.whatsapp || null,
    email: a.email || null,
    visibilidad: a.visibilidad,
  });
  if (!c) throw new Error('cambiar_visibilidad_contacto: no encontré el contacto');
  return { id: c.id, nombre: c.nombre, visibilidad: c.visibilidad };
}

// Setea el cumple de un contacto. Si no existe, lo crea privado mínimo.
function _setCumpleContacto(a, ctx) {
  _requerir(a, ['cumple']);
  if (!a.contactoId && !a.nombre && !a.whatsapp && !a.email) {
    throw new Error('set_cumple_contacto: pasá contactoId o nombre/whatsapp/email');
  }
  const c = mem.setCumpleContacto({
    usuarioId: ctx.usuario.id,
    contactoId: a.contactoId || null,
    nombre: a.nombre || null,
    whatsapp: a.whatsapp || null,
    email: a.email || null,
    cumple: a.cumple,
  });
  if (!c) throw new Error('set_cumple_contacto: no encontré ni pude crear el contacto');
  return { id: c.id, nombre: c.nombre, cumple: c.cumple, visibilidad: c.visibilidad };
}

// ─── Acciones del owner ──────────────────────────────────────────────────

// Geocodifica una ciudad ("Ciudad, PAIS") y devuelve { lat, lon, tz } o null.
// No lanza: si el geocoder falla o no hay match, devolvemos null y el caller
// sigue sin coords/tz derivada.
async function _geoDeUbicacion(ubic) {
  if (!ubic || !String(ubic).trim()) return null;
  try {
    return await clima.geocodificar(ubic);
  } catch (err) {
    console.warn(`[executor] geocode de "${ubic}" falló: ${err.message}`);
    return null;
  }
}

async function _crearUsuario(a, ctx) {
  if (!usuarios.esOwner(ctx.usuario.id)) {
    throw new Error('crear_usuario: solo el owner puede crear usuarios');
  }
  if (!usuarios.puedeCrearMas()) {
    const max = usuarios.maxUsuarios();
    throw new Error(`crear_usuario: esta instancia llegó al máximo de ${max} usuarios activos. Para sumar otro hay que desactivar uno antes (borrar_usuario) o subir el cap (env ASISTENTE_MAX_USUARIOS).`);
  }
  _requerir(a, ['nombre']);
  // Validar wa_cus contra WA Web antes de persistir. wa_lid se asume ya
  // capturado del runtime (msg.from), no se re-valida.
  let waCusNorm = null;
  if (a.wa_cus) {
    waCusNorm = await waValidate.normalizarWaCus(a.wa_cus, ctx.waClient);
  } else if (!a.wa_lid) {
    // Sin wa_cus ni wa_lid explícitos: intentar HEREDARLO de la libreta del
    // owner. Caso típico: el owner ya guardó a esta persona por vCard antes de
    // darla de alta (fue el bug de Gabi: se creaba "ciega" sin WhatsApp → sin
    // brief/recordatorios y sin resolución de sus mensajes). Best-effort: si el
    // número heredado no valida, NO bloqueamos el alta.
    try {
      let cont = mem.buscarContacto({ usuarioId: ctx.usuario.id, nombre: a.nombre });
      if (!cont || !cont.whatsapp) {
        const fuzzy = mem.buscarContactosVisibles(ctx.usuario.id, a.nombre, { max: 3 });
        cont = (fuzzy || []).find(c => c.whatsapp) || cont;
      }
      if (cont && cont.whatsapp) {
        waCusNorm = await waValidate.normalizarWaCus(cont.whatsapp, ctx.waClient);
        console.log(`[crear_usuario] wa_cus heredado de libreta: ${a.nombre} -> ${cont.whatsapp}`);
      }
    } catch (e) {
      console.warn(`[crear_usuario] no pude heredar wa de libreta para ${a.nombre}: ${e.message}`);
    }
  }
  // Si dieron ciudad y NO tz explícita, derivamos la tz del lugar (geocoder).
  let _tz = a.tz || null;
  let _geo = null;
  if (a.ubicacion) {
    _geo = await _geoDeUbicacion(a.ubicacion);
    if (_geo && _geo.tz && !a.tz) _tz = _geo.tz;
  }
  const u = usuarios.crear({
    nombre: a.nombre,
    wa_lid: a.wa_lid || null,
    wa_cus: waCusNorm,
    email: a.email || null,
    calendar_id: a.calendar_id || null,
    tz: _tz,
    brief_hora: a.brief_hora || null,
    brief_minuto: a.brief_minuto || null,
    ubicacion: a.ubicacion || null,
  });
  if (_geo) usuarios.setUbicacionCoords(u.id, _geo.lat, _geo.lon);
  // Marcar el morning-brief de hoy como "ya enviado" para que no se
  // dispare antes que el mensaje de bienvenida cuando el alta cae dentro
  // de la ventana del brief (07-11h por default). El primer brief real va
  // a salir mañana.
  try {
    const tz = u.tz || 'America/Argentina/Buenos_Aires';
    const hoy = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date()); // formato YYYY-MM-DD
    mem.setEstadoUsuario(u.id, 'morning_brief_ultimo_dia', hoy);
  } catch (err) {
    console.warn(`[executor] no pude pre-marcar morning_brief para id=${u.id}: ${err.message}`);
  }
  console.log(`[executor] usuario creado: id=${u.id} nombre=${u.nombre}${u.calendar_id ? '' : ' (sin calendar_id todavía)'}`);
  const _sinWa = !waCusNorm && !a.wa_lid;
  if (_sinWa) console.warn(`[crear_usuario] ${u.nombre} (id=${u.id}) quedó SIN WhatsApp: no recibirá brief/recordatorios ni se reconocerán sus mensajes hasta cargar su número`);
  return { id: u.id, nombre: u.nombre, creado: true, calendar_id: u.calendar_id || null, sin_whatsapp: _sinWa };
}

// Opt-out del brief matutino. Cualquier usuario puede pausar/reactivar el SUYO
// -- opera sobre ctx.usuario, sin owner-check ni id ajeno.
function _configurarBrief(a, ctx) {
  const activo = !(a.activo === false || a.activo === 0 || a.activo === 'false'
                   || a.activo === 'no' || a.activo === 'off' || a.activo === 'pausar');
  usuarios.setBriefActivo(ctx.usuario.id, activo ? 1 : 0);
  console.log(`[executor] brief ${activo ? 'reactivado' : 'pausado'} para ${ctx.usuario.nombre} (id=${ctx.usuario.id})`);
  return { usuario: ctx.usuario.nombre, brief_activo: activo ? 1 : 0 };
}

// Self-service: cada usuario fija SU propia ubicacion (ciudad) para el clima
// del brief. Opera sobre ctx.usuario, sin owner-check ni id ajeno. Cambiar la
// ubicacion limpia el cache lat/lon (se re-geocodifica en la proxima corrida).
async function _configurarUbicacion(a, ctx) {
  const ubic = (a.ubicacion != null && String(a.ubicacion).trim()) ? String(a.ubicacion).trim() : null;
  if (!ubic) throw new Error('configurar_ubicacion: falta la ciudad (campo ubicacion)');
  // Geocodificamos para derivar la zona horaria (y cachear lat/lon). Cambiar la
  // ciudad mueve también la tz del usuario: brief, agenda y horarios pasan a esa
  // zona. (usuarios.actualizar resetea lat/lon al cambiar ubicacion; por eso el
  // setUbicacionCoords va DESPUÉS.)
  const geo = await _geoDeUbicacion(ubic);
  const patch = { ubicacion: ubic };
  if (geo && geo.tz) patch.tz = geo.tz;
  const u = usuarios.actualizar(ctx.usuario.id, patch);
  if (geo) usuarios.setUbicacionCoords(ctx.usuario.id, geo.lat, geo.lon);
  console.log(`[executor] ubicacion fijada para ${ctx.usuario.nombre} (id=${ctx.usuario.id}): ${u.ubicacion} (tz=${u.tz})`);
  return { usuario: ctx.usuario.nombre, ubicacion: u.ubicacion, tz: u.tz };
}

async function _actualizarUsuario(a, ctx) {
  if (!usuarios.esOwner(ctx.usuario.id)) {
    throw new Error('actualizar_usuario: solo el owner puede actualizar usuarios');
  }
  _requerir(a, ['id']);
  const patch = {};
  for (const k of ['nombre', 'wa_lid', 'wa_cus', 'email', 'calendar_id', 'tz', 'brief_hora', 'brief_minuto', 'ubicacion']) {
    if (a[k] !== undefined) patch[k] = a[k];
  }
  if (!Object.keys(patch).length) throw new Error('actualizar_usuario: no hay campos para cambiar');
  // Si el patch incluye wa_cus, validar contra WA Web antes de persistir.
  if (patch.wa_cus) {
    patch.wa_cus = await waValidate.normalizarWaCus(patch.wa_cus, ctx.waClient);
  }
  // Si cambia la ubicacion, derivar tz del lugar (salvo que pasen tz explícita)
  // y cachear lat/lon (después del actualizar, que resetea coords).
  let _geoU = null;
  if (patch.ubicacion) {
    _geoU = await _geoDeUbicacion(patch.ubicacion);
    if (_geoU && _geoU.tz && patch.tz === undefined) patch.tz = _geoU.tz;
  }
  const u = usuarios.actualizar(a.id, patch);
  if (_geoU) usuarios.setUbicacionCoords(a.id, _geoU.lat, _geoU.lon);
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
  if (!usuarios.puedeCrearMas()) {
    const max = usuarios.maxUsuarios();
    throw new Error(`confirmar_prospecto_pendiente: esta instancia llegó al máximo de ${max} usuarios activos. Rechazá el prospecto o desactivá uno antes.`);
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
// El owner puede setear el calendar_acceso de cualquier usuario; un non-owner
// solo puede setear el SUYO PROPIO (caso típico: el user comparte su calendar
// y le avisa a Maria — el LLM emite la acción con usuarioId=ctx.usuario.id
// para autodetectar el accessRole real).
async function _setCalendarAcceso(a, ctx) {
  // Acepta usuario_id (snake) como alias de usuarioId — el LLM tiende a emitir
  // snake_case (consistente con resto de campos en el prompt).
  if (a.usuarioId == null && a.usuario_id != null) a.usuarioId = a.usuario_id;
  _requerir(a, ['usuarioId']);
  if (!usuarios.esOwner(ctx.usuario.id) && a.usuarioId !== ctx.usuario.id) {
    throw new Error('set_calendar_acceso: solo el owner o el propio usuario pueden setear este campo');
  }
  const u = usuarios.obtener(a.usuarioId);
  if (!u) throw new Error(`set_calendar_acceso: usuario ${a.usuarioId} no existe`);

  let modoFinal = a.modo;
  let detectado = null;

  if (modoFinal === 'autodetect' || (!modoFinal && a.autodetect)) {
    if (!u.calendar_id) {
      modoFinal = 'none';
    } else {
      const provider = await providers.forUser(u);
      // Self-heal: un calendar compartido desde otro Workspace (o cuyo mail de
      // invitacion no reconocio el auto-accept de Gmail) NO entra solo al
      // calendarList de Maria, asi que chequearAccesoCalendar daria 'none'
      // para siempre. Si el provider sabe aceptar shares, lo intentamos aca:
      // inserta el calendar en la lista de Maria y devuelve el accessRole.
      if (typeof provider.aceptarCalendarShare === 'function') {
        try {
          const acc = await provider.aceptarCalendarShare(u.calendar_id);
          if (acc && acc.ok && acc.accessRole) {
            const role = acc.accessRole;
            detectado = (role === 'writer' || role === 'owner') ? 'write'
                      : (role === 'reader' || role === 'freeBusyReader') ? 'read' : 'none';
          }
        } catch (e) { console.warn(`[executor] aceptarCalendarShare best-effort fallo: ${e.message}`); }
      }
      if (detectado == null) detectado = await provider.chequearAccesoCalendar(u.calendar_id);
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

// ─── CalDAV setup ────────────────────────────────────────────────────────
//
// Configura un usuario para que use CalDAV en vez de Google. Valida las
// credenciales contra el server (descubre calendarios), cifra el blob con
// vault y persiste en usuarios.calendar_auth_json. Setea calendar_provider
// = 'caldav' y calendar_acceso = 'write' (los users CalDAV siempre tienen
// write con sus propias credenciales — no hay tiers).
//
// Owner-only por default (solo el owner configura otros users). Los users
// no-owner pueden auto-configurarse pasando id = ctx.usuario.id explícito.
//
// Sanitización: el password llega vía un mensaje del user, queda en
// eventos.cuerpo plano. Tras OK, hacemos UPDATE limpiando el password
// literal en eventos recientes (últimas 30 min) reemplazándolo por
// [REDACTED]. Heurística aceptable para el riesgo conocido.
async function _configurarCaldav(a, ctx) {
  _requerir(a, ['server_url', 'username', 'password']);

  // Resolver id del usuario destino. Si no se pasa, asume el usuario actual.
  const targetId = a.id || a.usuario_id || ctx.usuario.id;
  const target = usuarios.obtener(targetId);
  if (!target) throw new Error(`configurar_caldav: usuario id=${targetId} no encontrado`);

  // Permiso: owner puede configurar a cualquiera; los demás solo a sí mismos.
  if (target.id !== ctx.usuario.id && !usuarios.esOwner(ctx.usuario.id)) {
    throw new Error('configurar_caldav: solo el owner puede configurar otros usuarios');
  }

  // Validar las creds intentando descubrir calendarios.
  let calendars;
  try {
    const { createDAVClient } = await import('tsdav');
    const client = await createDAVClient({
      serverUrl: a.server_url,
      credentials: { username: a.username, password: a.password },
      authMethod: 'Basic',
      defaultAccountType: 'caldav',
    });
    calendars = await client.fetchCalendars();
  } catch (err) {
    throw new Error(`configurar_caldav: el server rechazó las credenciales — ${err.message}. Revisá que sea un app-specific password y que el server URL sea correcto.`);
  }
  if (!calendars || !calendars.length) {
    throw new Error(`configurar_caldav: el server no devolvió calendarios para ${a.username}. Verificá que la cuenta tenga al menos un calendar habilitado.`);
  }

  // Resolver calendar default.
  let calendar = null;
  if (a.calendar_id) {
    calendar = calendars.find(c => c.url === a.calendar_id || c.displayName === a.calendar_id);
  }
  if (!calendar) calendar = calendars[0];

  // Cifrar blob con vault y persistir.
  const credsBlob = vault.cifrar({
    server_url: a.server_url,
    username: a.username,
    password: a.password,
    calendar_url: calendar.url,
    calendar_id: a.calendar_id || null,
  });

  usuarios.actualizar(target.id, {
    calendar_provider: 'caldav',
    calendar_auth_json: credsBlob,
    calendar_acceso: 'write',
  });

  // Sanitizar logs: reemplazar el password literal en eventos recientes.
  let redacted = 0;
  try {
    const filas = mem.db.prepare(`
      SELECT id, cuerpo FROM eventos
      WHERE timestamp >= datetime('now','-30 minutes')
        AND cuerpo LIKE ?
    `).all(`%${a.password}%`);
    for (const fila of filas) {
      const nuevo = fila.cuerpo.split(a.password).join('[REDACTED]');
      mem.db.prepare('UPDATE eventos SET cuerpo = ? WHERE id = ?').run(nuevo, fila.id);
      redacted++;
    }
  } catch (err) {
    console.warn(`[executor] configurar_caldav: sanitización falló: ${err.message}`);
  }

  mem.log({
    usuarioId: ctx.usuario.id,
    canal: 'sistema', direccion: 'interno',
    cuerpo: `caldav configurado para ${target.nombre} (id=${target.id})`,
    metadata: { server_url: a.server_url, username: a.username, calendars: calendars.length, calendar_url: calendar.url, redacted_eventos: redacted },
  });
  console.log(`[executor] caldav configurado: ${target.nombre} (id=${target.id}) → ${a.server_url} (${calendars.length} cal, redacted=${redacted})`);

  return {
    usuario_id: target.id,
    nombre: target.nombre,
    server_url: a.server_url,
    calendar_url: calendar.url,
    calendars_disponibles: calendars.map(c => ({ url: c.url, displayName: c.displayName })),
    eventos_sanitizados: redacted,
  };
}

// ─── Microsoft Graph OAuth flow ──────────────────────────────────────────
//
// Onboarding de un user no-Google con cuenta Microsoft (outlook, hotmail,
// office365, etc.). Es 2-step porque el user tiene que ir al browser
// a autorizar y volver con el authorization code:
//
//   1. iniciar_microsoft_auth → genera PKCE pair, arma authorize URL,
//      guarda code_verifier + state + target_user_id en estado_usuario
//      (clave: 'ms_oauth_pending'). Devuelve la URL para que el LLM se la
//      mande al user.
//   2. configurar_microsoft(code, state) → busca el estado pendiente,
//      intercambia code por tokens, descubre calendar default, cifra creds
//      con vault, persiste en usuarios.calendar_auth_json. Sanitiza el
//      code de los logs (similar a configurar_caldav con password).

async function _iniciarMicrosoftAuth(a, ctx) {
  // Target id: owner puede iniciar para cualquier usuario, el resto solo para sí.
  const targetId = a.id || a.usuario_id || ctx.usuario.id;
  const target = usuarios.obtener(targetId);
  if (!target) throw new Error(`iniciar_microsoft_auth: usuario id=${targetId} no encontrado`);
  if (target.id !== ctx.usuario.id && !usuarios.esOwner(ctx.usuario.id)) {
    throw new Error('iniciar_microsoft_auth: solo el owner puede iniciar para otros usuarios');
  }

  const { verifier, challenge } = microsoftProvider.nuevoPkcePair();
  const crypto = require('crypto');
  const state = crypto.randomBytes(16).toString('hex');
  const url = microsoftProvider.buildAuthUrl({
    state,
    codeChallenge: challenge,
    loginHint: target.email || null,
  });

  // Persistir el pending en estado_usuario del owner (no del target — el
  // target todavía no tiene context de Maria). TTL 15 min.
  mem.setEstadoUsuario(ctx.usuario.id, 'ms_oauth_pending', {
    target_user_id: target.id,
    target_nombre: target.nombre,
    verifier, state,
    ts: Date.now(),
  });

  mem.log({
    usuarioId: ctx.usuario.id,
    canal: 'sistema', direccion: 'interno',
    cuerpo: `microsoft oauth iniciado para ${target.nombre} (id=${target.id})`,
    metadata: { target_user_id: target.id, state },
  });
  console.log(`[executor] microsoft oauth iniciado: target=${target.nombre} (id=${target.id}) state=${state.slice(0,8)}...`);

  return {
    auth_url: url,
    target_user_id: target.id,
    target_nombre: target.nombre,
    expires_in_minutos: 15,
    instrucciones: `Pasale al user esta URL para que autorice. Al final del flow, su browser va a quedar en una página que dice "no se puede acceder a este sitio" o similar — eso es normal. Lo importante es la URL del browser, que va a tener un parámetro ?code=... muy largo. El user te pasa ESE code (todo el valor de code), no la URL completa.`,
  };
}

async function _configurarMicrosoft(a, ctx) {
  _requerir(a, ['code']);

  // Recuperar pending. Si no hay, error claro.
  const pending = mem.getEstadoUsuario(ctx.usuario.id, 'ms_oauth_pending');
  if (!pending) {
    throw new Error('configurar_microsoft: no hay onboarding Microsoft pendiente — correr iniciar_microsoft_auth primero');
  }
  const edadMin = (Date.now() - (pending.ts || 0)) / 60_000;
  if (edadMin > 15) {
    throw new Error(`configurar_microsoft: el código expiró (${edadMin.toFixed(0)} min) — re-correr iniciar_microsoft_auth`);
  }

  const target = usuarios.obtener(pending.target_user_id);
  if (!target) throw new Error(`configurar_microsoft: target_user_id=${pending.target_user_id} ya no existe`);

  // Intercambiar code por tokens.
  let tokens;
  try {
    tokens = await microsoftProvider.intercambiarCodePorTokens({
      code: a.code,
      codeVerifier: pending.verifier,
    });
  } catch (err) {
    throw new Error(`configurar_microsoft: el server rechazó el código — ${err.message}. Probablemente expiró o se copió mal. Re-correr iniciar_microsoft_auth.`);
  }
  if (!tokens.refresh_token) {
    throw new Error('configurar_microsoft: Microsoft no devolvió refresh_token. Verificar que el scope offline_access esté incluído en los permisos de Azure.');
  }

  // Descubrir calendar default vía un fetch directo con el access_token recién recibido.
  let calendarId = null;
  try {
    const res = await fetch('https://graph.microsoft.com/v1.0/me/calendar', {
      headers: { 'Authorization': `Bearer ${tokens.access_token}` },
    });
    if (res.ok) {
      const cal = await res.json();
      calendarId = cal.id || null;
    }
  } catch (err) {
    console.warn(`[executor] configurar_microsoft: no pude descubrir calendar_id: ${err.message}`);
  }

  const credsBlob = vault.cifrar({
    refresh_token: tokens.refresh_token,
    access_token: tokens.access_token,
    expires_at: Date.now() + (tokens.expires_in || 3600) * 1000,
    scope: tokens.scope || 'Calendars.ReadWrite User.Read offline_access',
    calendar_id: calendarId,
  });

  usuarios.actualizar(target.id, {
    calendar_provider: 'microsoft',
    calendar_auth_json: credsBlob,
    calendar_acceso: 'write',
  });

  // Sanitizar el code en logs recientes.
  let redacted = 0;
  try {
    const filas = mem.db.prepare(`
      SELECT id, cuerpo FROM eventos
      WHERE timestamp >= datetime('now','-30 minutes')
        AND cuerpo LIKE ?
    `).all(`%${a.code}%`);
    for (const f of filas) {
      const nuevo = f.cuerpo.split(a.code).join('[REDACTED]');
      mem.db.prepare('UPDATE eventos SET cuerpo = ? WHERE id = ?').run(nuevo, f.id);
      redacted++;
    }
  } catch (err) {
    console.warn(`[executor] configurar_microsoft: sanitización falló: ${err.message}`);
  }

  // Limpiar el pending.
  mem.setEstadoUsuario(ctx.usuario.id, 'ms_oauth_pending', null);

  mem.log({
    usuarioId: ctx.usuario.id,
    canal: 'sistema', direccion: 'interno',
    cuerpo: `microsoft configurado para ${target.nombre} (id=${target.id})`,
    metadata: { target_user_id: target.id, calendar_id: calendarId, redacted_eventos: redacted },
  });
  console.log(`[executor] microsoft configurado: ${target.nombre} (id=${target.id}) calendar=${calendarId} redacted=${redacted}`);

  return {
    usuario_id: target.id,
    nombre: target.nombre,
    calendar_id: calendarId,
    eventos_sanitizados: redacted,
  };
}

module.exports = { ejecutarAcciones };
