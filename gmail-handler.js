// gmail-handler.js — poll de Gmail para emails no leídos (multi-user)
//
// Maria tiene UN gmail (maria.paez.secre@gmail.com). Todos los usuarios le
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

const mem = require('./memory');
const g   = require('./google');
const usuarios = require('./usuarios');
const unknownFlow = require('./unknown-flow');
const { construirPrompt } = require('./prompt-builder');
const { invocarClaudeJSON } = require('./claude-client');
const { ejecutarAcciones } = require('./executor');

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
    metadata: { messageId: id, threadId: email.threadId, fecha: email.fecha },
  });

  await _procesarComoUsuario({
    usuario,
    entrada: {
      de: email.de,
      email: email.de,
      asunto: email.asunto,
      cuerpo: emailCuerpo,
      messageId: id,
    },
    waClient,
  });
}

/**
 * Pipeline post-resolución: prompt → Claude → respuesta → acciones.
 * Se llama tanto para emails de usuarios conocidos como para reencauzados
 * desde unknown-flow.
 */
async function _procesarComoUsuario({ usuario, entrada, waClient, autoResponderEmail = true }) {
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
    const { json } = await invocarClaudeJSON(prompt);
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
  } else {
    console.log(`[GMAIL/${usuario.nombre}] ${entrada.messageId} — sin acciones ni respuesta, queda no-leído`);
  }
}

// ─── Poll loop ──────────────────────────────────────────────────────────

async function pollOnce({ waClient, maxPorRonda = 5 } = {}) {
  let emails;
  try {
    emails = await g.listarEmailsNoLeidos({ max: 20 });
  } catch (err) {
    console.error('[GMAIL] poll falló:', err.message);
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
function iniciarPoll({ waClient, intervaloMs = 60_000 } = {}) {
  const tick = () => {
    pollOnce({ waClient }).catch(err =>
      console.error('[GMAIL] tick error:', err.message)
    );
  };
  tick(); // arranque inmediato
  return setInterval(tick, intervaloMs);
}

module.exports = { iniciarPoll, pollOnce, procesarUnEmail };
