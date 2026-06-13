// gmail-handler.js — poll de Gmail para emails no leídos (multi-user)
//
// Maria tiene UN gmail (el seteado en ASISTENTE_FROM_EMAIL del .conf). Todos los usuarios le
// escriben al mismo inbox. Por cada email nuevo:
//   0) resolver al usuario por el header From:
//      - si matchea → pipeline normal (usuario = él).
//      - si no matchea → unknown-flow.handleEmail(): pregunta a quién va y,
//        si matchea después, re-entra a la pipeline como si el email le
//        hubiera llegado directo al usuario destinatario.
//   1) log entrante (usuario_id)
//   2) prompt con contexto del usuario
//   3) Claude → { respuesta, acciones, razonamiento }
//   4) si respuesta no vacía → acción responder_email contra este messageId
//   5) ejecutar acciones (ctx.usuario, ctx.waClient para notificaciones)
//
// Tracking: set global `gmail:procesados` (inbox único, no por usuario).

const loopGuard = require('./loop-guard');
const fs = require('fs');
const path = require('path');
const mem = require('./memory');
const g   = require('./google');
const usuarios = require('./usuarios');
const seguridad = require('./seguridad');
const moderacion = require('./moderacion');
const unknownFlow = require('./unknown-flow');
const { construirPrompt, construirTurnoSesion } = require('./prompt-builder');
const { invocarClaudeJSON, invocarClaudeJSONConConsultas } = require('./claude-client');
const sesiones = require('./session-manager');
const { ejecutarAcciones } = require('./executor');
const providers = require('./providers');

const KEY_PROCESADOS = 'gmail:procesados';
const MAX_PROCESADOS = 1000; // limitamos el set para que no crezca infinito

function _procesados() {
  return new Set(mem.getEstado(KEY_PROCESADOS) || []);
}

function _marcarProcesado(id) {
  const arr = mem.getEstado(KEY_PROCESADOS) || [];
  if (!arr.includes(id)) arr.push(id);
  while (arr.length > MAX_PROCESADOS) arr.shift();
  mem.setEstado(KEY_PROCESADOS, arr);
}

// ─── Procesamiento de un email ──────────────────────────────────────────

// Detecta si el email entrante es una notificación de Google sobre un share
// de calendar y, si lo es, intenta auto-aceptarlo y aplicar el accessRole al
// usuario correspondiente. Devuelve true si lo procesó (el caller no debe
// seguir con el pipeline normal); false si no aplica.
async function _intentarAceptarShareCalendar(email, messageId) {
  const asunto = email.asunto || '';
  const cuerpo = email.cuerpo || email.snippet || '';
  const esShareAccept = /shared a calendar|invited you to see all event details|invited you to make changes|Accept the invite to join this shared calendar|comparti\u00f3 un calendario|te invit\u00f3 a ver|te invit\u00f3 a hacer cambios|invitaci\u00f3n para unirte al calendario compartido|Acepta la invitaci\u00f3n para unirte a este calendario compartido/i.test(cuerpo)
    || /Accept your invitation to join shared calendar|shared calendar|Acepta tu invitaci\u00f3n para unirte al calendario compartido|calendario compartido|comparti\u00f3 un calendario/i.test(asunto);
  const esAccessUpdate = /Calendar access updated|updated your access to the shared calendar|Acceso al calendario actualizado|actualiz\u00f3 tu acceso al calendario/i.test(cuerpo)
    || /Calendar access updated|Acceso al calendario actualizado/i.test(asunto);
  if (!esShareAccept && !esAccessUpdate) return false;

  // Extraer calendar_id: el email del From: ES el id del calendar primario.
  const fromMatch = String(email.de || '').match(/<([^>]+)>/);
  const calendarId = (fromMatch ? fromMatch[1] : String(email.de || '')).trim().toLowerCase();
  if (!calendarId || !calendarId.includes('@')) {
    console.warn(`[GMAIL share] no pude extraer calendar_id de "${email.de}"`);
    return false;
  }

  console.log(`[GMAIL share] detectado share para calendar_id=${calendarId} — intentando auto-accept`);

  // 1) Aceptar el share contra la API de Google Calendar de Maria.
  //    Esto siempre va contra Maria (su calendar) — no depende del provider
  //    del usuario que está compartiendo, porque el share llega al Gmail de
  //    Maria y se acepta desde su calendar.
  let res;
  try {
    const mariaProvider = await providers.forMaria();
    res = await mariaProvider.aceptarCalendarShare(calendarId);
  } catch (err) {
    console.error(`[GMAIL share] aceptarCalendarShare(${calendarId}) tiró: ${err.message}`);
    return false;
  }
  if (!res.ok) {
    console.warn(`[GMAIL share] no pude aceptar ${calendarId}: ${res.error}`);
    // No marcamos procesado — quizá un retry futuro funcione.
    return false;
  }

  // 2) Mapear accessRole a tier (mismo mapping que chequearAccesoCalendar).
  const role = res.accessRole;
  let tier = 'none';
  if (role === 'writer' || role === 'owner') tier = 'write';
  else if (role === 'reader' || role === 'freeBusyReader') tier = 'read';

  // 3) Buscar usuario activo que matchee al calendar_id (por usuarios.calendar_id
  //    explícito o, si está vacío, por usuarios.email).
  let match = usuarios.listarActivos().find(u => (u.calendar_id || '').toLowerCase() === calendarId);
  if (!match) {
    match = usuarios.listarActivos().find(u => (u.email || '').toLowerCase() === calendarId);
  }

  // 4) Actualizar DB del usuario (calendar_id si vacío + calendar_acceso).
  if (match) {
    const patch = { calendar_id: match.calendar_id || calendarId };
    try {
      usuarios.actualizar(match.id, patch);
      usuarios.setearCalendarAcceso(match.id, tier);
      mem.log({
        usuarioId: match.id,
        canal: 'sistema', direccion: 'interno',
        cuerpo: `auto-accept calendar share: ${calendarId} → ${tier} (role=${role}${res.yaEstaba ? ', ya estaba' : ''})`,
        metadata: { calendarId, role, tier, fuente: 'gmail-auto-accept', yaEstaba: !!res.yaEstaba },
      });
      console.log(`[GMAIL share] ✓ ${match.nombre}: calendar_acceso → ${tier} (role=${role})`);
    } catch (err) {
      console.warn(`[GMAIL share] usuario ${match.id} actualizar/setear acceso falló: ${err.message}`);
    }
  } else {
    // El share es de alguien que aún no es usuario — lo dejamos aceptado
    // en el calendarList pero sin usuario asociado. Loggeamos para visibilidad.
    mem.log({
      canal: 'sistema', direccion: 'interno',
      cuerpo: `auto-accept calendar share sin usuario asociado: ${calendarId} (role=${role})`,
      metadata: { calendarId, role, fuente: 'gmail-auto-accept' },
    });
    console.log(`[GMAIL share] aceptado ${calendarId} (role=${role}) pero ningún usuario activo matchea`);
  }

  // 5) Marcar el email como leído así no queda en el inbox de Maria.
  if (messageId) {
    try { await g.marcarLeido(messageId); } catch { /* best-effort */ }
  }

  return true;
}

async function procesarUnEmail(id, { waClient } = {}) {
  let email;
  try {
    email = await g.leerEmail(id);
  } catch (err) {
    console.error(`[GMAIL] no pude leer ${id}:`, err.message);
    mem.log({
      canal: 'sistema', direccion: 'interno',
      cuerpo: `leerEmail falló para ${id}: ${err.message}`,
    });
    return;
  }

  const emailCuerpo = (email.cuerpo || email.snippet || '').slice(0, 4000);
  console.log(`[GMAIL ←] ${email.de} | "${email.asunto}"`);

  // ─── Pre-handler: auto-accept de calendar shares ───────────────────────
  // Cuando un usuario (especialmente con cuenta Gmail consumer) comparte su
  // calendar con Maria, Google manda un email "X shared a calendar" con un
  // link "Add this calendar to your list". Hasta que ese link no se clickee,
  // el calendar NO entra en el calendarList de Maria → chequearAccesoCalendar
  // devuelve 'none'. Para evitar fricción manual, detectamos esos emails y
  // hacemos calendarList.insert() programático contra la API.
  if (await _intentarAceptarShareCalendar(email, id)) {
    return; // share aceptado y procesado — no pasamos al pipeline normal
  }

  // ─── Resolver usuario por From ────────────────────────────────────────
  const usuario = usuarios.resolverPorEmailFrom(email.de);

  if (!usuario) {
    // Desconocido → unknown flow. responderEmailFn usa g.responderEmail.
    await unknownFlow.handleEmail({
      waClient,
      email: { ...email, id, cuerpo: emailCuerpo },
      responderEmailFn: async (messageId, texto) => {
        return await g.responderEmail(messageId, texto);
      },
      reprocesarComoUsuario: async (usuarioDestino, entrada) => {
        // En el reprocesado, no auto-responder por email — unknown-flow ya le
        // mandó al desconocido un "se lo paso a <user>". Claude debe usar
        // enviar_wa para notificar al usuario destinatario.
        await _procesarComoUsuario({
          usuario: usuarioDestino,
          entrada,
          waClient,
          autoResponderEmail: false,
        });
      },
    });
    return;
  }

  // Log entrante (usuario conocido).
  mem.log({
    usuarioId: usuario.id,
    canal: 'gmail', direccion: 'entrante',
    de: email.de, asunto: email.asunto, cuerpo: emailCuerpo,
    tipo_original: 'email',
    metadata: { messageId: id, threadId: email.threadId, fecha: email.fecha, para: email.para, cc: email.cc },
  });

  // Computar otros destinatarios (To+Cc menos María menos el usuario atendido).
  // Si la lista no es vacía y el remitente ES el usuario, estamos en una
  // cadena multi-destinatario: el usuario sumó a Maria para coordinar con
  // terceros. El prompt-builder usa esto para inyectar instrucciones.
  const _split = (h) => (h || '').split(',').map(s => s.trim()).filter(Boolean);
  const _emailOf = (s) => {
    const m = String(s).match(/<([^>]+)>/);
    return (m ? m[1] : s).trim().toLowerCase();
  };
  const meEmail = (g.MARIA_EMAIL || '').toLowerCase();
  const usrEmail = (usuario.email || '').toLowerCase();
  const otrosDestinatarios = [..._split(email.para), ..._split(email.cc)]
    .filter(s => {
      const e = _emailOf(s);
      return e && e !== meEmail && e !== usrEmail;
    });

  // Visión multimodal: si el mail tiene adjuntos imagen/PDF, los bajamos
  // a /tmp para que Claude Code los lea con su tool Read vía @path.
  const attachmentPaths = [];
  const MAX_BYTES = 20 * 1024 * 1024; // 20 MB cap por adjunto
  for (const att of (email.adjuntos || [])) {
    const esImagenOPdf = /^image\//i.test(att.mimeType) || /^application\/pdf$/i.test(att.mimeType);
    if (!esImagenOPdf) continue;
    if (att.size && att.size > MAX_BYTES) {
      console.warn(`[GMAIL] adjunto ${att.filename} > 20MB, lo salteo`);
      continue;
    }
    try {
      const buf = await g.descargarAdjunto(id, att.attachmentId);
      // Filename seguro
      const safeName = att.filename.replace(/[^A-Za-z0-9._-]/g, '_');
      const tmpPath = path.join('/tmp', `maria-attach-${id}-${safeName}`);
      fs.writeFileSync(tmpPath, buf);
      attachmentPaths.push(tmpPath);
      console.log(`[GMAIL] adjunto → ${tmpPath} (${Math.round(buf.length / 1024)} KB)`);
    } catch (err) {
      console.warn(`[GMAIL] no pude descargar adjunto ${att.filename}: ${err.message}`);
    }
  }

  try {
    await _procesarComoUsuario({
      usuario,
      entrada: {
        de: email.de,
        email: email.de,
        asunto: email.asunto,
        cuerpo: emailCuerpo,
        messageId: id,
        para: email.para || '',
        cc: email.cc || '',
        otrosDestinatarios,
        ...(attachmentPaths.length ? { attachmentPaths } : {}),
      },
      waClient,
    });
  } finally {
    for (const p of attachmentPaths) {
      try { fs.unlinkSync(p); } catch {}
    }
  }
}

/**
 * Pipeline post-resolución: prompt → Claude → respuesta → acciones.
 * Se llama tanto para emails de usuarios conocidos como para reencauzados
 * desde unknown-flow.
 */
async function _procesarComoUsuario({ usuario, entrada, waClient, autoResponderEmail = true }) {
  // Pre-filtro de injection sobre asunto + cuerpo del mail (entrante).
  const _payload = `${entrada.asunto || ''}\n${entrada.cuerpo || ''}`;
  const _motivo = seguridad.detectarInjection(_payload);
  if (_motivo) {
    console.warn(`[GMAIL injection] ${entrada.de} → ${_motivo}`);
    mem.logSecurityEvent({
      usuarioId: usuario.id,
      canal: 'gmail',
      motivo: `injection_attempt: ${_motivo}`,
      body: _payload.slice(0, 500),
      extra: { from: entrada.de, asunto: entrada.asunto },
    });
    // Mail al owner por CADA intento (decisión de Diego, sin cooldown).
    try {
      const owner = require('./usuarios').obtenerOwner();
      if (owner?.email) {
        const g = require('./google');
        const ASISTENTE_NOMBRE = process.env.ASISTENTE_NOMBRE || 'Maria';
        await g.enviarEmail({
          to: owner.email,
          asunto: `🚨 ${ASISTENTE_NOMBRE}: prompt injection detectado en email (${_motivo})`,
          texto: `Detecté un intento de prompt injection en un email entrante.\n\nCanal: gmail\nMotivo: ${_motivo}\nDe: ${entrada.de}\nAsunto: ${entrada.asunto || '(sin asunto)'}\nUsuario destino: ${usuario.nombre} (id=${usuario.id})\n\nCuerpo:\n---\n${(entrada.cuerpo || '').slice(0, 2000)}\n---\n\nMaria lo va a rechazar (Capa 2 del prompt).\n\n--\n${ASISTENTE_NOMBRE}`,
        });
      }
    } catch (err) {
      console.warn(`[GMAIL injection mail] no pude mandar al owner: ${err.message}`);
    }
    // NO bloqueamos — el LLM lo rechaza vía Capa 2.
  }

  // ─── Moderación de contenido ENTRANTE (best-effort, no bloquea) ───────
  moderacion.revisarEntrante(entrada.cuerpo).then((rm) => {
    if (rm && rm.bloquear) {
      mem.logSecurityEvent({
        usuarioId: usuario?.id || null, canal: 'gmail',
        motivo: `contenido_entrante (${rm.categoria}/${rm.severidad}): ${rm.motivo || ''}`,
        body: (entrada.cuerpo || '').slice(0, 500),
        extra: { from: entrada.de, asunto: entrada.asunto, tipo_mod: 'entrante_flag', categoria: rm.categoria, severidad: rm.severidad },
      });
      _avisoOwnerContenidoInboundMail({ categoria: rm.categoria, severidad: rm.severidad, motivo: rm.motivo, de: entrada.de, asunto: entrada.asunto });
    }
  }).catch(() => {});

  const prompt = await construirPrompt({
    usuario,
    canal: 'gmail',
    entrada,
  });

  let respUsr = '';
  let respRem = '';
  let acciones = [];
  let razonamiento = null;
  try {
    // ─── Sesiones persistentes (MARIA_SESIONES=1, default APAGADO) ───────
    // Mismo flujo que whatsapp-handler._procesarComoUsuario: con sesión viva
    // resumimos la conversación de la CLI (--resume) y mandamos solo el turno
    // compacto; la API relee reglas + contexto previo del prompt cache.
    // Requiere prompt split {system,user}.
    // Turnos de TERCEROS van sessionless (incidente 2026-06-11): no mezclar
    // interlocutores en la historia lineal de la sesión del usuario.
    const _esTurnoDeUsuario = !!entrada.de && !!usuario.email
      && String(entrada.de).toLowerCase().includes(String(usuario.email).toLowerCase());
    const SESIONES_ON = process.env.MARIA_SESIONES === '1'
      && prompt && typeof prompt === 'object' && !!prompt.system
      && _esTurnoDeUsuario;
    const auditGmail = { usuarioId: usuario.id, canal: 'gmail' };
    let json;
    if (!SESIONES_ON) {
      ({ json } = await invocarClaudeJSONConConsultas(prompt, { usuario }, { audit: auditGmail, sesion: 'off' }));
    } else {
      // Mutex por usuario: WA y Gmail comparten la misma sesión del usuario —
      // dos turnos concurrentes no pueden resumirla en paralelo (fork de historia).
      json = await sesiones.lockUsuario(usuario.id, async () => {
        const hash = sesiones.promptHashDe(prompt.system);
        let ses = sesiones.getSesion(usuario.id);
        if (ses && sesiones.debeRotar(ses, hash)) {
          console.log(`[GMAIL sesion/${usuario.nombre}] rotando sesión (turnos=${ses.turnos}, creada=${ses.creada})`);
          sesiones.resetSesion(usuario.id);
          ses = null;
        }
        const turnoInicial = async () => {
          const r = await invocarClaudeJSONConConsultas(prompt, { usuario }, { audit: auditGmail, sesion: 'nueva', sesionTurno: 1 });
          if (r.sessionId) {
            sesiones.guardarSesion(usuario.id, { id: r.sessionId, turnos: 1, creada: new Date().toISOString(), promptHash: hash });
          }
          return r.json;
        };
        if (!ses) return await turnoInicial();
        const turno = await construirTurnoSesion({ usuario, canal: 'gmail', entrada });
        try {
          const r = await invocarClaudeJSONConConsultas(turno, { usuario }, {
            audit: auditGmail, resumeId: ses.id, sesion: 'resume', sesionTurno: ses.turnos + 1,
          });
          // Cada --resume devuelve un session_id nuevo — persistimos ese.
          sesiones.guardarSesion(usuario.id, { ...ses, id: r.sessionId || ses.id, turnos: ses.turnos + 1 });
          return r.json;
        } catch (err) {
          if (err.codigo !== 'RESUME_FALLIDO') throw err;
          // Sesión muerta: rotamos y caemos UNA vez al turno inicial completo.
          console.warn(`[GMAIL sesion/${usuario.nombre}] resume falló (${err.message}) — roto sesión y reintento con prompt completo`);
          sesiones.resetSesion(usuario.id);
          return await turnoInicial();
        }
      });
    }
    respUsr      = (json.respuesta_a_usuario   || '').toString();
    respRem      = (json.respuesta_a_remitente || '').toString();
    // Compat: si solo viene `respuesta` legacy, en Gmail se trata como
    // respuesta al remitente del thread (mantiene comportamiento previo:
    // auto-responder al messageId).
    if (!respUsr && !respRem && json.respuesta) {
      respRem = json.respuesta.toString();
    }
    acciones     = Array.isArray(json.acciones) ? json.acciones : [];
    razonamiento = json.razonamiento || null;
  } catch (err) {
    console.error(`[GMAIL/${usuario.nombre}] Claude falló en ${entrada.messageId}:`, err.message);
    mem.log({
      usuarioId: usuario.id,
      canal: 'sistema', direccion: 'interno',
      cuerpo: `Claude falló procesando email ${entrada.messageId} (${usuario.nombre}): ${err.message}`,
    });
    return;
  }

  // ¿El remitente del email es el mismo usuario atendido?
  const rawDe = (entrada.email || entrada.de || '').toLowerCase();
  const m = rawDe.match(/<([^>]+)>/);
  const remEmail = (m ? m[1] : rawDe).trim();
  const usrEmail = (usuario.email || '').toLowerCase().trim();
  const remitenteEsUsuario = !!remEmail && !!usrEmail && remEmail === usrEmail;

  // 1) respuesta_a_remitente → responder_email al thread del entrante.
  //    autoResponderEmail puede haberse seteado en false desde unknown-flow
  //    para evitar contestar autoresponder; si está en false, NO autoreplico
  //    aunque haya texto (el LLM puede emitir responder_email a mano).
  const yaResponde = acciones.some(
    a => a.tipo === 'responder_email' && a.messageId === entrada.messageId
  );
  if (respRem.trim() && !yaResponde && autoResponderEmail) {
    acciones.unshift({
      tipo: 'responder_email',
      messageId: entrada.messageId,
      asunto: entrada.asunto,
      texto: respRem,
    });
  }

  // 2) respuesta_a_usuario → enviar_wa al wa del usuario, PERO solo si:
  //    a) el remitente es un tercero (si fuera el mismo usuario, ya cubre
  //       respuesta_a_remitente y duplicaría el contenido), y
  //    b) el usuario tiene wa configurado.
  if (respUsr.trim() && !remitenteEsUsuario) {
    const waUsuario = usuario.wa_lid || usuario.wa_cus;
    if (waUsuario) {
      // No duplicar si el LLM ya emitió un enviar_wa equivalente.
      const yaAvisa = acciones.some(
        a => a.tipo === 'enviar_wa' &&
             (a.a === waUsuario || a.a === usuario.wa_lid || a.a === usuario.wa_cus)
      );
      if (!yaAvisa) {
        acciones.push({
          tipo: 'enviar_wa',
          a: waUsuario,
          texto: respUsr,
        });
      }
    } else {
      console.warn(`[GMAIL/${usuario.nombre}] respuesta_a_usuario presente pero el usuario no tiene wa configurado — se descarta`);
    }
  }

  if (razonamiento && (respRem.trim() || respUsr.trim())) {
    mem.log({
      usuarioId: usuario.id,
      canal: 'sistema', direccion: 'interno',
      cuerpo: `razonamiento Gmail ${entrada.messageId} (${usuario.nombre}): ${razonamiento}`,
    });
  }

  if (acciones.length) {
    const resultados = await ejecutarAcciones(acciones, {
      usuario,
      waClient,
      canalOrigen: 'gmail',
    });
    const ok = resultados.filter(r => r.ok).length;
    console.log(`[GMAIL acciones/${usuario.nombre}] ${ok}/${resultados.length} ejecutadas`);
    if (ok < resultados.length) {
      const fallas = resultados
        .filter(r => !r.ok)
        .map(r => `${r.accion?.tipo || '?'}: ${r.error}`)
        .join(' | ');
      console.warn(`[GMAIL acciones/${usuario.nombre}] FALLARON: ${fallas}`);
    }
  } else {
    console.log(`[GMAIL/${usuario.nombre}] ${entrada.messageId} — sin acciones ni respuesta, queda no-leído`);
  }
}

// ─── Poll loop ──────────────────────────────────────────────────────────

async function pollOnce({ waClient, maxPorRonda = 5 } = {}) {
  let emails;
  try {
    emails = await g.listarEmailsNoLeidos({ max: 20 });
    loopGuard.reportar('acceso_google', true);
  } catch (err) {
    console.error('[GMAIL] poll falló:', err.message);
    if (loopGuard.esErrorAccesoGoogle(err)) loopGuard.reportar('acceso_google', false, err);
    return;
  }
  if (!emails.length) return;

  const procesados = _procesados();
  const nuevos = emails.filter(e => !procesados.has(e.id)).slice(0, maxPorRonda);
  if (!nuevos.length) return;

  console.log(`[GMAIL poll] ${nuevos.length} email(s) nuevo(s)`);
  for (const em of nuevos) {
    try {
      await procesarUnEmail(em.id, { waClient });
    } catch (err) {
      console.error(`[GMAIL] error procesando ${em.id}:`, err);
    } finally {
      _marcarProcesado(em.id);
    }
  }
}

/**
 * Arranca el poll cada `intervaloMs`. Dispara una vez inmediatamente.
 * Devuelve el handle del setInterval por si querés cancelarlo.
 */
function iniciarPoll({ waClient, intervaloMs = 300_000 } = {}) {
  const tick = () => {
    pollOnce({ waClient }).catch(err =>
      console.error('[GMAIL] tick error:', err.message)
    );
  };
  tick(); // arranque inmediato
  return setInterval(tick, intervaloMs);
}

// Aviso al owner por contenido entrante inapropiado por email (throttled).
const _ultimoAvisoInboundMail = { ts: 0 };
async function _avisoOwnerContenidoInboundMail({ categoria, severidad, motivo, de, asunto }) {
  try {
    const owner = require('./usuarios').obtenerOwner();
    if (!owner?.email) return;
    const ahora = Date.now();
    const THR = Number(process.env.MARIA_MOD_AVISO_THROTTLE_MS || 5 * 60 * 1000);
    if (ahora - _ultimoAvisoInboundMail.ts < THR) return;
    _ultimoAvisoInboundMail.ts = ahora;
    const g = require('./google');
    const ASISTENTE_NOMBRE = process.env.ASISTENTE_NOMBRE || 'Maria';
    await g.enviarEmail({
      to: owner.email,
      asunto: `⚠️ ${ASISTENTE_NOMBRE}: contenido inapropiado entrante por email (${categoria})`,
      texto: `Un email entrante trae contenido marcado como inapropiado.\n\nCategoría: ${categoria} (${severidad})\nMotivo: ${motivo || '-'}\nDe: ${de}\nAsunto: ${asunto || '(sin asunto)'}\n\nMaria no actúa sobre eso (regla #7). Aviso informativo.\n\n--\n${ASISTENTE_NOMBRE}`,
    });
  } catch (err) {
    console.warn(`[moderacion inbound mail] no pude avisar al owner: ${err.message}`);
  }
}

module.exports = { iniciarPoll, pollOnce, procesarUnEmail };
