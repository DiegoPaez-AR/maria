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

  let respuesta = '';
  let acciones = [];
  let razonamiento = null;
  try {
    const { json } = await invocarClaudeJSON(prompt);
    respuesta    = (json.respuesta || '').toString();
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

  // Si hay respuesta y Claude no incluyó ya un responder_email para este id,
  // lo agregamos automático.
  const yaResponde = acciones.some(
    a => a.tipo === 'responder_email' && a.messageId === entrada.messageId
  );
  if (respuesta.trim() && !yaResponde && autoResponderEmail) {
    acciones.unshift({
      tipo: 'responder_email',
      messageId: entrada.messageId,
      asunto: entrada.asunto,
      texto: respuesta,
    });
    if (razonamiento) {
      mem.log({
        usuarioId: usuario.id,
        canal: 'sistema', direccion: 'interno',
        cuerpo: `razonamiento Gmail ${entrada.messageId} (${usuario.nombre}): ${razonamiento}`,
      });
    }
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
