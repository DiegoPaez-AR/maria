// gmail-handler.js — poll de Gmail para emails no leídos
//
// Cada `intervaloMs`:
//   1) lista emails no leídos
//   2) filtra los ya procesados (tracking en `estado` → 'gmail:procesados')
//   3) para cada uno: log entrante → prompt → Claude → ejecutar acciones
//
// Convención: si Claude devuelve `respuesta` con contenido, lo wrapeamos como
// `responder_email` contra el messageId actual. Esto mantiene la simetría con
// WA (respuesta = lo que le decís al emisor) sin que Claude tenga que
// duplicar la intención. Si Claude quiere hacer algo distinto (ej. no
// responder pero notificar a Diego por WA), simplemente deja respuesta=''
// y emite acciones.
//
// Emails procesados con respuesta=vacía se quedan sin leer en Gmail — Diego
// decide qué hacer con ellos (pero NO los reprocesamos).

const mem = require('./memory');
const g   = require('./google');
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

  // Log entrante
  mem.log({
    canal: 'gmail', direccion: 'entrante',
    de: email.de, asunto: email.asunto, cuerpo: emailCuerpo,
    tipo_original: 'email',
    metadata: { messageId: id, threadId: email.threadId, fecha: email.fecha },
  });

  // Prompt
  const prompt = await construirPrompt({
    canal: 'gmail',
    entrada: {
      de: email.de,
      email: email.de,
      asunto: email.asunto,
      cuerpo: emailCuerpo,
      messageId: id,
    },
  });

  // Claude
  let respuesta = '';
  let acciones = [];
  let razonamiento = null;
  try {
    const { json } = await invocarClaudeJSON(prompt);
    respuesta    = (json.respuesta || '').toString();
    acciones     = Array.isArray(json.acciones) ? json.acciones : [];
    razonamiento = json.razonamiento || null;
  } catch (err) {
    console.error(`[GMAIL] Claude falló en ${id}:`, err.message);
    mem.log({
      canal: 'sistema', direccion: 'interno',
      cuerpo: `Claude falló procesando email ${id}: ${err.message}`,
    });
    return;
  }

  // Si hay respuesta y Claude no incluyó ya un responder_email para este id,
  // lo agregamos automático.
  const yaResponde = acciones.some(
    a => a.tipo === 'responder_email' && a.messageId === id
  );
  if (respuesta.trim() && !yaResponde) {
    acciones.unshift({
      tipo: 'responder_email',
      messageId: id,
      asunto: email.asunto,
      texto: respuesta,
    });
    // Nota: el log saliente lo hace executor._responderEmail, no duplicamos.
    if (razonamiento) {
      mem.log({
        canal: 'sistema', direccion: 'interno',
        cuerpo: `razonamiento Gmail ${id}: ${razonamiento}`,
      });
    }
  }

  // Ejecutar acciones
  if (acciones.length) {
    const resultados = await ejecutarAcciones(acciones, {
      waClient, canalOrigen: 'gmail',
    });
    const ok = resultados.filter(r => r.ok).length;
    console.log(`[GMAIL acciones] ${ok}/${resultados.length} ejecutadas`);
  } else {
    console.log(`[GMAIL] ${id} — sin acciones ni respuesta, queda no-leído`);
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
