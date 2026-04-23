// unknown-flow.js — flujo de "remitente desconocido" con LLM pre-pass.
//
// Cuando a Maria le escribe alguien por WA o Gmail que NO matchea con
// ningún usuario activo, entramos acá. Hay dos capas:
//
//   1) LLM pre-pass — primero consultamos el historial reciente de Maria
//      con ese remitente (WA Web + Gmail, 14 días) + su historial con el
//      owner, y pasamos todo a Claude para que clasifique:
//
//        a) usuario_activo   → el remitente ES uno de los usuarios activos
//                              (quizás desde un número/email nuevo).
//                              Ruteamos directo.
//        b) tercero_de_usuario → el remitente es un tercero (no usuario)
//                              respondiendo/consultando sobre algo que
//                              uno de los usuarios me pidió gestionar
//                              (ej. "pedile el menú a X" → X me responde).
//                              Procesamos el mensaje en el contexto de
//                              ese usuario — el prompt normal ya sabe
//                              manejar "tercero pidiendo algo".
//        c) prospecto_pendiente → el owner nos pidió recientemente que
//                              agreguemos a alguien y este remitente encaja.
//                              Guardamos el pedido como "pending" y NOTIFICAMOS
//                              al owner pidiendo confirmación explícita.
//                              NUNCA creamos usuarios automáticamente.
//        d) desconocido      → no hay contexto suficiente. Caemos al flujo
//                              viejo (FSM: preguntar "para quién va",
//                              matchear contra usuarios activos en el
//                              próximo mensaje).
//
//   2) Fallback FSM (legacy) — si el LLM falla, timeouteá, o devuelve
//      desconocido: seguimos el flujo viejo. Es determinístico y seguro.
//
// Estado: usamos estado_usuario(OWNER_ID, clave):
//   - `unknown:<canal>:<rid>`           → FSM legacy (preguntamos "para quién")
//   - `unknown_pending:<canal>:<rid>`   → prospecto detectado por LLM, esperando
//                                         confirmación del owner

const mem = require('./memory');
const usuarios = require('./usuarios');
const ctxFetcher = require('./context-fetcher');
const { invocarClaudeJSON } = require('./claude-client');

// Lazy-require de google.js para no cargar googleapis si no hace falta
// (y para evitar problemas de init cuando este módulo se carga temprano).
let _gModule = null;
function _google() {
  if (!_gModule) _gModule = require('./google');
  return _gModule;
}

// ─── Helpers de estado ──────────────────────────────────────────────────

function _claveAsk(canal, remitenteId) {
  return `unknown:${canal}:${remitenteId}`;
}
function _clavePending(canal, remitenteId) {
  return `unknown_pending:${canal}:${remitenteId}`;
}

function _estadoOwner() {
  const o = usuarios.obtenerOwner();
  return o || null;
}

function leerEstado(canal, remitenteId) {
  const o = _estadoOwner(); if (!o) return null;
  return mem.getEstadoUsuario(o.id, _claveAsk(canal, remitenteId));
}
function guardarEstado(canal, remitenteId, data) {
  const o = _estadoOwner(); if (!o) return;
  mem.setEstadoUsuario(o.id, _claveAsk(canal, remitenteId), data);
}
function limpiarEstado(canal, remitenteId) {
  const o = _estadoOwner(); if (!o) return;
  mem.borrarEstadoUsuario(o.id, _claveAsk(canal, remitenteId));
}

function leerProspectoPendiente(canal, remitenteId) {
  const o = _estadoOwner(); if (!o) return null;
  return mem.getEstadoUsuario(o.id, _clavePending(canal, remitenteId));
}
function guardarProspectoPendiente(canal, remitenteId, data) {
  const o = _estadoOwner(); if (!o) return;
  mem.setEstadoUsuario(o.id, _clavePending(canal, remitenteId), data);
}
function limpiarProspectoPendiente(canal, remitenteId) {
  const o = _estadoOwner(); if (!o) return;
  mem.borrarEstadoUsuario(o.id, _clavePending(canal, remitenteId));
}

// Lista TODOS los prospectos pendientes (cualquier canal) para que el
// prompt-builder del owner los pueda mostrar.
function listarProspectosPendientes() {
  const o = _estadoOwner(); if (!o) return [];
  try {
    const filas = mem.db.prepare(`
      SELECT clave, valor_json, actualizado
      FROM estado_usuario
      WHERE usuario_id = ? AND clave LIKE 'unknown_pending:%'
      ORDER BY actualizado DESC
    `).all(o.id);
    return filas.map(f => {
      let data = null;
      try { data = JSON.parse(f.valor_json); } catch { data = {}; }
      // clave formato: unknown_pending:<canal>:<remitente_id>
      const rest = f.clave.slice('unknown_pending:'.length);
      const idxColon = rest.indexOf(':');
      const canal = idxColon === -1 ? rest : rest.slice(0, idxColon);
      const remitente_id = idxColon === -1 ? '' : rest.slice(idxColon + 1);
      return { canal, remitente_id, actualizado: f.actualizado, ...data };
    });
  } catch {
    return [];
  }
}

// ─── Matching determinístico (fallback FSM) ─────────────────────────────

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
 * intentar identificar al usuario destinatario por nombre.
 */
function matchearUsuario(texto) {
  const t = _norm(texto);
  if (!t) return null;
  const activos = usuarios.listarActivos();
  const hits = [];
  for (const u of activos) {
    const nombre   = _norm(u.nombre);
    const primero  = nombre.split(' ')[0];
    const padded   = ` ${t} `;
    const hitsNombre  = nombre  && padded.includes(` ${nombre} `);
    const hitsPrimero = primero && padded.includes(` ${primero} `);
    if (hitsNombre || hitsPrimero) hits.push(u);
  }
  if (hits.length === 1) return hits[0];
  return null;
}

// ─── Notificación al owner ──────────────────────────────────────────────

async function _notificarOwner(waClient, texto) {
  const owner = _estadoOwner();
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

// ─── LLM pre-pass ───────────────────────────────────────────────────────

/**
 * Resuelve un remitente desconocido usando historial + LLM. Devuelve
 * { resolucion, usuario_id?, nombre_sugerido?, wa_cus_sugerido?,
 *   email_sugerido?, razon, raw }
 * donde resolucion ∈ { 'usuario_activo', 'prospecto_pendiente', 'desconocido' }.
 *
 * Si algo falla (fetch, LLM, JSON), devuelve null y el caller cae al FSM.
 */
async function _resolverConLLM({ canal, cuerpo, from, senderEmail, pushname, asunto, waClient }) {
  const owner = _estadoOwner();
  if (!owner) return null;

  const activos = usuarios.listarActivos();
  const pendientesPrev = listarProspectosPendientes();

  // Fetch historias en paralelo (best-effort, cada una captura sus errores).
  const promHistWA    = (canal === 'whatsapp' && waClient && from)
    ? ctxFetcher.historialWA(waClient, from, { dias: 14, max: 200 })
    : Promise.resolve({ ok: true, lineas: [], total: 0 });
  const promHistMail  = senderEmail
    ? ctxFetcher.historialEmail(_google(), senderEmail, { dias: 14, max: 50 })
    : Promise.resolve({ ok: true, lineas: [], total: 0 });
  const histOwner = ctxFetcher.historialOwnerConMaria(mem, owner, { dias: 14, max: 80 });

  const [histWA, histMail] = await Promise.all([promHistWA, promHistMail]);

  const listaUsuarios = activos.length
    ? activos.map(u => `  - id=${u.id}, nombre="${u.nombre}"${u.wa_cus ? `, wa_cus=${u.wa_cus}` : ''}${u.email ? `, email=${u.email}` : ''}${u.rol === 'owner' ? ' (owner)' : ''}`).join('\n')
    : '  (no hay usuarios activos)';

  const listaPendientes = pendientesPrev.length
    ? pendientesPrev.map(p => `  - canal=${p.canal}, remitente=${p.remitente_id}, sugerido="${p.nombre_sugerido || '(?)'}", creado=${p.ts}`).join('\n')
    : '  (sin prospectos pendientes previos)';

  const seccionHistWA = canal === 'whatsapp'
    ? (histWA.lineas.length
        ? `[HISTORIAL WA MARIA ↔ REMITENTE — 14d, ${histWA.total} msgs]\n${histWA.lineas.join('\n')}`
        : `[HISTORIAL WA MARIA ↔ REMITENTE — 14d]\n(vacío${histWA.error ? ` · error: ${histWA.error}` : ''})`)
    : '';
  const seccionHistMail = senderEmail
    ? (histMail.lineas.length
        ? `[HISTORIAL GMAIL MARIA ↔ REMITENTE — 14d, ${histMail.total} msgs]\n${histMail.lineas.join('\n')}`
        : `[HISTORIAL GMAIL MARIA ↔ REMITENTE — 14d]\n(vacío${histMail.error ? ` · error: ${histMail.error}` : ''})`)
    : '';
  const seccionHistOwner = histOwner.lineas.length
    ? `[HISTORIAL WA MARIA ↔ OWNER (${owner.nombre}) — 14d, ${histOwner.total} msgs]\n${histOwner.lineas.join('\n')}`
    : `[HISTORIAL WA MARIA ↔ OWNER — 14d]\n(vacío)`;

  const prompt = `Sos Maria, asistente multi-usuario. Te escribió alguien por ${canal} y NO matchea con ningún usuario activo. Tu tarea es clasificar quién es.

[USUARIOS ACTIVOS]
${listaUsuarios}

[PROSPECTOS PENDIENTES DE CONFIRMACIÓN (ya avisados al owner, esperan su OK)]
${listaPendientes}

[REMITENTE ACTUAL]
- Canal: ${canal}
- ID: ${from || senderEmail || '(?)'}${pushname ? `\n- Pushname WA: "${pushname}"` : ''}${senderEmail ? `\n- Email: ${senderEmail}` : ''}${asunto ? `\n- Asunto: "${asunto}"` : ''}
- Mensaje actual:
"""
${(cuerpo || '').slice(0, 1200)}
"""

${seccionHistWA}

${seccionHistMail}

${seccionHistOwner}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TAREA:
Clasificá el remitente en UNA de estas cuatro opciones:

  A) "usuario_activo" — es UNO de los usuarios activos de la lista de arriba
     (por ej., escribiendo desde un número/email nuevo, pero el historial
     deja claro que es la misma persona). Devolvé el "usuario_id" exacto.

  B) "tercero_de_usuario" — NO es un usuario, pero hay evidencia clara en el
     historial (WA Maria ↔ remitente, y/o WA Maria ↔ owner) de que este
     mensaje es parte de una gestión que ${owner.nombre} u otro usuario me
     pidió llevar adelante. Ejemplos típicos:
       · Maria le escribió hace poco a este número/email a pedido del usuario
         (ej. "pedile el menú a X") y ahora el tercero responde.
       · El owner mencionó en su historial un nombre/apodo que matchea con
         el pushname/asunto del remitente, en un contexto de gestión.
     Devolvé "usuario_id" = id del usuario dueño de la gestión (si hay duda
     entre varios usuarios, elegí el owner).

  C) "prospecto_pendiente" — el owner (${owner.nombre}) te pidió a vos
     recientemente que agregaras a alguien COMO USUARIO (no como contacto de
     gestión), y este remitente encaja con esa descripción. Devolvé
     "nombre_sugerido" (el nombre que el owner mencionó). IMPORTANTE: nunca
     creamos usuarios automáticamente — acá sólo marcamos que *probablemente*
     haya que crearlo; el owner confirmará.

  D) "desconocido" — no hay contexto suficiente para clasificarlo como A, B o C.

Reglas:
- Ante duda, elegí "desconocido". Es MUCHO mejor preguntar que asumir mal.
- NO inventes usuarios que no estén en la lista.
- Diferenciá bien B vs C: B es un contacto puntual que responde sobre una
  gestión. C es alguien que el owner pidió agregar PERMANENTEMENTE como
  usuario (con su propio calendario, su propia libreta, etc.). Si el owner
  dijo "pedile X a Pepe", Pepe es B. Si dijo "agregame a Pepe como usuario",
  Pepe es C.
- Si la razón para usuario_activo o tercero_de_usuario no es obvia, preferí
  prospecto_pendiente o desconocido.
- Si ya hay un prospecto pendiente para este mismo remitente (lista de arriba),
  devolvé "desconocido" — ya está esperando confirmación.

Respondé SOLO con JSON válido, sin markdown, sin texto antes ni después:
{
  "resolucion": "usuario_activo" | "tercero_de_usuario" | "prospecto_pendiente" | "desconocido",
  "usuario_id": <int | null>,
  "nombre_sugerido": <string | null>,
  "wa_cus_sugerido": <string | null>,
  "email_sugerido": <string | null>,
  "razon": "una línea explicando por qué"
}`;

  console.log(`[unknown-flow/${canal}] LLM pre-pass inputs: hist_wa=${histWA.total || 0}${histWA.error ? `(err:${histWA.error})` : ''} hist_mail=${histMail.total || 0}${histMail.error ? `(err:${histMail.error})` : ''} hist_owner=${histOwner.total || 0}${histOwner.error ? `(err:${histOwner.error})` : ''} remitente=${from || senderEmail || '?'}`);
  try {
    const { json, raw } = await invocarClaudeJSON(prompt, { timeoutMs: 90_000 });
    if (!json || !json.resolucion) {
      console.warn(`[unknown-flow/${canal}] LLM devolvió respuesta sin resolucion`);
      return null;
    }
    console.log(`[unknown-flow/${canal}] LLM resolucion: ${json.resolucion}${json.usuario_id ? ` usuario_id=${json.usuario_id}` : ''}${json.nombre_sugerido ? ` sugerido="${json.nombre_sugerido}"` : ''} · ${json.razon || '(sin razón)'}`);
    // Dejamos traza persistente en eventos para que Diego pueda revisar
    // después qué vio el LLM y por qué decidió lo que decidió.
    try {
      mem.log({
        usuarioId: owner.id,
        canal: 'sistema', direccion: 'interno',
        cuerpo: `unknown-flow/${canal} LLM: ${json.resolucion}${json.usuario_id ? ` usuario_id=${json.usuario_id}` : ''} · ${json.razon || ''}`,
        metadata: {
          tipo: 'unknown_llm_trace',
          canal, from: from || senderEmail, pushname,
          hist_wa_total: histWA.total || 0,
          hist_mail_total: histMail.total || 0,
          hist_owner_total: histOwner.total || 0,
          resolucion: json.resolucion,
          usuario_id: json.usuario_id || null,
          nombre_sugerido: json.nombre_sugerido || null,
          razon: json.razon || null,
        },
      });
    } catch {}
    return { ...json, raw };
  } catch (err) {
    console.error(`[unknown-flow/${canal}] LLM pre-pass falló:`, err.message);
    return null;
  }
}

// ─── Handlers ───────────────────────────────────────────────────────────

/**
 * Handler para WhatsApp. Devuelve true si fue procesado acá.
 */
async function handleWA({ client, msg, cuerpo, reprocesarComoUsuario }) {
  const from = msg.from;
  const pushname = msg._data?.notifyName || null;
  const messageId = msg.id?._serialized || null;
  const owner = _estadoOwner();

  // Si YA hay un prospecto pendiente para este remitente, registramos el
  // mensaje y esperamos al owner — no volvemos a molestar.
  const pendPrev = leerProspectoPendiente('whatsapp', from);
  if (pendPrev) {
    if (owner) {
      mem.log({
        usuarioId: owner.id,
        canal: 'whatsapp', direccion: 'entrante',
        de: from, nombre: pushname, cuerpo,
        metadata: { tipo: 'unknown_pending_followup', messageId, pendDesde: pendPrev.ts },
      });
    }
    console.log(`[unknown-flow/wa] prospecto pendiente ya existente para ${from} — esperando owner`);
    return true;
  }

  // Si ya preguntamos "para quién va" (FSM legacy), seguimos el flujo viejo.
  const estadoFSM = leerEstado('whatsapp', from);
  if (estadoFSM) {
    return await _handleWA_FSM_segunda({ client, from, pushname, cuerpo, estado: estadoFSM, reprocesarComoUsuario });
  }

  // Primera vez → LLM pre-pass.
  const llm = await _resolverConLLM({
    canal: 'whatsapp', cuerpo, from, pushname, waClient: client,
  });

  if (llm && llm.resolucion === 'usuario_activo' && llm.usuario_id) {
    const match = usuarios.obtener(llm.usuario_id);
    if (match && match.activo) {
      return await _routearAUsuarioActivo({
        client, match, from, pushname, cuerpo, messageId, razon: llm.razon || '',
        reprocesarComoUsuario,
      });
    }
    // LLM alucinó id → fallback al FSM abajo.
  }

  if (llm && llm.resolucion === 'tercero_de_usuario' && llm.usuario_id) {
    const match = usuarios.obtener(llm.usuario_id);
    if (match && match.activo) {
      return await _routearComoTerceroDeUsuario({
        client, match, from, pushname, cuerpo, messageId, razon: llm.razon || '',
        reprocesarComoUsuario,
      });
    }
    // LLM alucinó id → fallback al FSM abajo.
  }

  if (llm && llm.resolucion === 'prospecto_pendiente') {
    return await _abrirProspectoPendiente({
      client, canal: 'whatsapp', from, pushname, cuerpo, messageId, llm,
    });
  }

  // desconocido (o LLM falló) → FSM legacy primera vez (preguntar).
  return await _handleWA_FSM_primera({ client, from, pushname, cuerpo, messageId });
}

async function _routearAUsuarioActivo({ client, match, from, pushname, cuerpo, messageId, razon, reprocesarComoUsuario }) {
  // Capturar @lid si corresponde.
  let capturadoLid = false;
  if (from && from.endsWith('@lid') && !match.wa_lid) {
    usuarios.setWaLid(match.id, from);
    capturadoLid = true;
    console.log(`[unknown-flow/wa] capturado @lid para ${match.nombre}: ${from}`);
  }
  const owner = _estadoOwner();
  if (owner) {
    mem.log({
      usuarioId: owner.id,
      canal: 'whatsapp', direccion: 'entrante',
      de: from, nombre: pushname, cuerpo,
      metadata: { tipo: 'unknown_llm_rute', messageId, a_usuario: match.id, razon },
    });
  }
  try {
    await client.sendMessage(from, `Listo, se lo paso a ${match.nombre}. Gracias.`);
  } catch (err) {
    console.error('[unknown-flow/wa] ack falló:', err.message);
  }
  await _notificarOwner(client,
    `🔎 Me escribió *${pushname || from}* (${from}) y el LLM lo identificó como *${match.nombre}* (id=${match.id}).${capturadoLid ? ' (Capturé su @lid.)' : ''}\nRazón: ${razon || '(sin razón)'}\n\nMensaje: "${cuerpo.slice(0, 400)}"\n\nLo ruteo a su cuenta.`
  );
  try {
    await reprocesarComoUsuario(match, {
      de: from, nombre: pushname || from, cuerpo, esAudio: false, messageId,
    });
  } catch (err) {
    console.error('[unknown-flow/wa] reprocesar falló:', err.message);
  }
  console.log(`[unknown-flow/wa] LLM routeó ${from} → ${match.nombre} (id=${match.id})`);
  return true;
}

/**
 * El remitente no es un usuario, pero es un tercero respondiéndole a Maria
 * algo que uno de los usuarios le pidió gestionar (ej. pedile el menú a X).
 * Reprocesamos el mensaje en el contexto del usuario dueño de la gestión —
 * el prompt normal del usuario sabe manejar "te escribe un tercero".
 *
 * No ack-eamos al tercero: quien decide qué responder es el LLM del prompt
 * del usuario (puede ser responder directo, puede ser preguntarle al usuario
 * antes, etc.).
 */
async function _routearComoTerceroDeUsuario({ client, match, from, pushname, cuerpo, messageId, razon, reprocesarComoUsuario }) {
  const quien = pushname || from;
  // Loggear el mensaje entrante en el bucket del USUARIO (no del owner) para
  // que aparezca en su historial cross-canal cuando armemos su próximo prompt.
  mem.log({
    usuarioId: match.id,
    canal: 'whatsapp', direccion: 'entrante',
    de: from, nombre: pushname, cuerpo,
    metadata: { tipo: 'unknown_llm_tercero', messageId, razon },
  });
  await _notificarOwner(client,
    `🔗 Me escribió *${quien}* (${from}) por WA. El LLM detectó que es un tercero relacionado a una gestión de *${match.nombre}* (id=${match.id}).\nRazón: ${razon || '(sin razón)'}\n\nMensaje: "${cuerpo.slice(0, 400)}"\n\nLo proceso en el contexto de ${match.nombre}.`
  );
  try {
    await reprocesarComoUsuario(match, {
      de: from, nombre: pushname || from, cuerpo, esAudio: false, messageId,
    });
  } catch (err) {
    console.error('[unknown-flow/wa] reprocesar tercero falló:', err.message);
  }
  console.log(`[unknown-flow/wa] tercero_de_usuario: ${from} → contexto de ${match.nombre} (id=${match.id})`);
  return true;
}

async function _abrirProspectoPendiente({ client, canal, from, pushname, cuerpo, messageId, llm }) {
  const owner = _estadoOwner();
  const waCusSug = (canal === 'whatsapp' && from && from.endsWith('@c.us')) ? from : null;
  const emailSug = llm.email_sugerido || (canal === 'gmail' ? (from || '').match(/<([^>]+)>/)?.[1] || from : null);

  guardarProspectoPendiente(canal, from, {
    canal,
    from,
    pushname: pushname || null,
    nombre_sugerido: llm.nombre_sugerido || null,
    wa_cus_sugerido: llm.wa_cus_sugerido || waCusSug,
    email_sugerido:  llm.email_sugerido  || emailSug,
    razon: llm.razon || '',
    original_body: cuerpo,
    messageId,
    ts: new Date().toISOString(),
  });
  if (owner) {
    mem.log({
      usuarioId: owner.id,
      canal: canal === 'whatsapp' ? 'whatsapp' : 'gmail',
      direccion: 'entrante',
      de: from, nombre: pushname, cuerpo,
      metadata: {
        tipo: 'unknown_pending_created', messageId,
        nombre_sugerido: llm.nombre_sugerido, razon: llm.razon,
      },
    });
  }
  const quien = pushname || from;
  const sugerido = llm.nombre_sugerido ? `*${llm.nombre_sugerido}*` : '(sin nombre detectado)';
  const razonLn  = llm.razon ? `\nRazón: ${llm.razon}` : '';
  await _notificarOwner(client,
    `🕵️ Me escribió *${quien}* (${from}) por ${canal}. Creo que es ${sugerido}.${razonLn}\n\nMensaje: "${cuerpo.slice(0, 400)}"\n\n¿Lo creo como usuario? Decime "sí" / "no" (o acotá nombre/datos si querés).`
  );
  // Al remitente NO le contestamos — el owner decide. Si insiste, su mensaje
  // queda loggeado pero no re-avisamos.
  console.log(`[unknown-flow/${canal}] prospecto pendiente abierto: ${from} → "${llm.nombre_sugerido || '(?)'}"`);
  return true;
}

async function _handleWA_FSM_primera({ client, from, pushname, cuerpo, messageId }) {
  const owner = _estadoOwner();
  const preguntaTxt = `¡Hola! Soy María, asistente personal. No te tengo registrado. ¿Para quién de las personas que asisto es este mensaje?`;
  try {
    await client.sendMessage(from, preguntaTxt);
  } catch (err) {
    console.error('[unknown-flow/wa] sendMessage falló:', err.message);
  }
  guardarEstado('whatsapp', from, {
    canal: 'whatsapp', original_body: cuerpo, messageId, pushname,
    ts: new Date().toISOString(),
  });
  if (owner) {
    mem.log({
      usuarioId: owner.id,
      canal: 'whatsapp', direccion: 'entrante',
      de: from, nombre: pushname, cuerpo,
      metadata: { tipo: 'unknown_first', messageId },
    });
  }
  await _notificarOwner(client,
    `🚪 Te escribe alguien por WA que no conozco: *${pushname || from}* (${from}).\n\nMensaje: "${cuerpo.slice(0, 400)}"\n\nLe pregunté para quién va.`
  );
  console.log(`[unknown-flow/wa] primer contacto de ${from} — preguntando (FSM)`);
  return true;
}

async function _handleWA_FSM_segunda({ client, from, pushname, cuerpo, estado, reprocesarComoUsuario }) {
  const match = matchearUsuario(cuerpo);
  if (match) {
    let capturadoLid = false;
    if (from && from.endsWith('@lid') && !match.wa_lid) {
      usuarios.setWaLid(match.id, from);
      capturadoLid = true;
    }
    try {
      await client.sendMessage(from, `Listo, se lo paso a ${match.nombre}. Gracias.`);
    } catch (err) {
      console.error('[unknown-flow/wa] ack falló:', err.message);
    }
    await _notificarOwner(client,
      `➡️ Routeé el mensaje de *${pushname || from}* (${from}) a *${match.nombre}* (id=${match.id}).${capturadoLid ? ` (Capturé su @lid.)` : ''}\n\nMensaje original: "${(estado.original_body || '').slice(0, 400)}"`
    );
    limpiarEstado('whatsapp', from);
    try {
      await reprocesarComoUsuario(match, {
        de: from, nombre: pushname || from,
        cuerpo: estado.original_body, esAudio: false,
        messageId: estado.messageId,
      });
    } catch (err) {
      console.error('[unknown-flow/wa] reprocesar falló:', err.message);
    }
    console.log(`[unknown-flow/wa] FSM routeó ${from} → ${match.nombre}`);
    return true;
  }
  try {
    await client.sendMessage(from, `Perdón, no conozco a esa persona. Cierro acá.`);
  } catch (err) {
    console.error('[unknown-flow/wa] cerrar falló:', err.message);
  }
  const msgOriginal = (estado?.original_body || '').slice(0, 400);
  const respuestaDesc = cuerpo.slice(0, 400);
  await _notificarOwner(client,
    `❌ Cerré el thread con *${pushname || from}* (${from}) por WA — no pude identificar para quién.\n\n` +
    `Mensaje original: "${msgOriginal}"\n` +
    `Su respuesta a "¿para quién va?": "${respuestaDesc}"\n\n` +
    `Lo asumí erróneo. Si era para vos, avisame y te paso el contenido.`
  );
  limpiarEstado('whatsapp', from);
  console.log(`[unknown-flow/wa] FSM cerrado ${from} — sin match`);
  return true;
}

/**
 * Handler para Gmail. Mismo esquema que WA pero el canal es email.
 */
async function handleEmail({ waClient, email, reprocesarComoUsuario, responderEmailFn }) {
  const remitenteId = email.de; // header From completo
  const m = String(remitenteId || '').match(/<([^>]+)>/);
  const senderEmail = (m ? m[1] : String(remitenteId || '')).trim().toLowerCase();
  const owner = _estadoOwner();

  const pendPrev = leerProspectoPendiente('gmail', remitenteId);
  if (pendPrev) {
    if (owner) {
      mem.log({
        usuarioId: owner.id,
        canal: 'gmail', direccion: 'entrante',
        de: email.de, asunto: email.asunto,
        cuerpo: email.cuerpo || email.snippet || '',
        metadata: { tipo: 'unknown_pending_followup', messageId: email.id, pendDesde: pendPrev.ts },
      });
    }
    console.log(`[unknown-flow/gmail] prospecto pendiente ya existente para ${remitenteId} — esperando owner`);
    return true;
  }

  const estadoFSM = leerEstado('gmail', remitenteId);
  if (estadoFSM) {
    return await _handleEmail_FSM_segunda({ waClient, email, estado: estadoFSM, reprocesarComoUsuario, responderEmailFn });
  }

  // LLM pre-pass.
  const cuerpo = email.cuerpo || email.snippet || '';
  const llm = await _resolverConLLM({
    canal: 'gmail', cuerpo, from: remitenteId, senderEmail,
    asunto: email.asunto, waClient,
  });

  if (llm && llm.resolucion === 'usuario_activo' && llm.usuario_id) {
    const match = usuarios.obtener(llm.usuario_id);
    if (match && match.activo) {
      if (owner) {
        mem.log({
          usuarioId: owner.id,
          canal: 'gmail', direccion: 'entrante',
          de: email.de, asunto: email.asunto, cuerpo,
          metadata: { tipo: 'unknown_llm_rute', messageId: email.id, a_usuario: match.id, razon: llm.razon },
        });
      }
      try {
        await responderEmailFn(email.id, `Gracias, se lo paso a ${match.nombre}.\n\nSaludos,\nMaría`);
      } catch (err) {
        console.error('[unknown-flow/gmail] ack falló:', err.message);
      }
      await _notificarOwner(waClient,
        `🔎 Me escribió ${email.de} por email y el LLM lo identificó como *${match.nombre}* (id=${match.id}).\nRazón: ${llm.razon || '(sin razón)'}\n\nAsunto: "${email.asunto || ''}"\n\nLo ruteo a su cuenta.`
      );
      try {
        await reprocesarComoUsuario(match, {
          de: email.de, email: email.de,
          asunto: email.asunto, cuerpo,
          messageId: email.id,
        });
      } catch (err) {
        console.error('[unknown-flow/gmail] reprocesar falló:', err.message);
      }
      console.log(`[unknown-flow/gmail] LLM routeó ${email.de} → ${match.nombre}`);
      return true;
    }
  }

  if (llm && llm.resolucion === 'tercero_de_usuario' && llm.usuario_id) {
    const match = usuarios.obtener(llm.usuario_id);
    if (match && match.activo) {
      // Log en bucket del usuario destinatario para que aparezca en su
      // historial cross-canal.
      mem.log({
        usuarioId: match.id,
        canal: 'gmail', direccion: 'entrante',
        de: email.de, asunto: email.asunto, cuerpo,
        metadata: { tipo: 'unknown_llm_tercero', messageId: email.id, razon: llm.razon },
      });
      // NO respondemos al tercero acá — el prompt del usuario decide.
      await _notificarOwner(waClient,
        `🔗 Me escribió ${email.de} por email. El LLM detectó que es un tercero relacionado a una gestión de *${match.nombre}* (id=${match.id}).\nRazón: ${llm.razon || '(sin razón)'}\n\nAsunto: "${email.asunto || ''}"\n\nLo proceso en el contexto de ${match.nombre}.`
      );
      try {
        await reprocesarComoUsuario(match, {
          de: email.de, email: email.de,
          asunto: email.asunto, cuerpo,
          messageId: email.id,
        });
      } catch (err) {
        console.error('[unknown-flow/gmail] reprocesar tercero falló:', err.message);
      }
      console.log(`[unknown-flow/gmail] tercero_de_usuario: ${email.de} → contexto de ${match.nombre}`);
      return true;
    }
  }

  if (llm && llm.resolucion === 'prospecto_pendiente') {
    // Guardamos el prospecto con canal=gmail. No contestamos al remitente.
    return await _abrirProspectoPendiente({
      client: waClient, canal: 'gmail', from: remitenteId,
      pushname: null, cuerpo, messageId: email.id, llm,
    });
  }

  // desconocido → FSM primera vez.
  return await _handleEmail_FSM_primera({ waClient, email, responderEmailFn });
}

async function _handleEmail_FSM_primera({ waClient, email, responderEmailFn }) {
  const owner = _estadoOwner();
  const remitenteId = email.de;
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
  console.log(`[unknown-flow/gmail] primer contacto de ${email.de} (FSM)`);
  return true;
}

async function _handleEmail_FSM_segunda({ waClient, email, estado, reprocesarComoUsuario, responderEmailFn }) {
  const remitenteId = email.de;
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
        de: email.de, email: email.de,
        asunto: estado.asunto || email.asunto,
        cuerpo: estado.original_body || email.cuerpo,
        messageId: estado.messageId || email.id,
      });
    } catch (err) {
      console.error('[unknown-flow/gmail] reprocesar falló:', err.message);
    }
    console.log(`[unknown-flow/gmail] FSM routeó ${email.de} → ${match.nombre}`);
    return true;
  }
  try {
    await responderEmailFn(email.id, `Perdón, no conozco a esa persona. Cierro acá.\n\nSaludos,\nMaría`);
  } catch (err) {
    console.error('[unknown-flow/gmail] cerrar falló:', err.message);
  }
  const asuntoOrig = estado?.asunto || email.asunto || '(sin asunto)';
  const msgOriginal = (estado?.original_body || '').slice(0, 400);
  const respuestaDesc = (email.cuerpo || email.snippet || '').slice(0, 400);
  await _notificarOwner(waClient,
    `❌ Cerré el thread de email con ${email.de} — no pude identificar para quién.\n\n` +
    `Asunto: "${asuntoOrig}"\n` +
    `Mensaje original: "${msgOriginal}"\n` +
    `Su respuesta a "¿para quién va?": "${respuestaDesc}"\n\n` +
    `Lo asumí erróneo. Si era para vos, avisame y te paso el contenido.`
  );
  limpiarEstado('gmail', remitenteId);
  return true;
}

module.exports = {
  handleWA,
  handleEmail,
  matchearUsuario,
  // legacy FSM (por compatibilidad):
  leerEstado,
  guardarEstado,
  limpiarEstado,
  // prospectos pendientes (usado por executor y prompt-builder):
  leerProspectoPendiente,
  guardarProspectoPendiente,
  limpiarProspectoPendiente,
  listarProspectosPendientes,
};
