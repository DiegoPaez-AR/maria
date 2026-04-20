// prompt-builder.js — arma el prompt completo que va a `claude -p`
//
// Consume: memory.js + google.js + instrucciones.txt
// Produce: un string listo para pipear a Claude, que va a responder JSON estructurado.
//
// El JSON que esperamos de Claude:
// {
//   "respuesta": "texto que Maria le devuelve al usuario por el mismo canal",
//   "acciones": [
//     { "tipo": "crear_evento",    "summary": "...", "start": "...", "end": "...", "descripcion": "..." },
//     { "tipo": "modificar_evento","id": "...", "summary": "...", "start": "...", "end": "..." },
//     { "tipo": "borrar_evento",   "id": "..." },
//     { "tipo": "responder_email", "messageId": "...", "texto": "..." },
//     { "tipo": "enviar_wa",       "a": "541...@c.us", "texto": "..." },
//     { "tipo": "agregar_pendiente","desc": "...", "meta": {...} },
//     { "tipo": "upsert_contacto", "nombre": "...", "whatsapp": "...", "email": "...", "notas": "..." }
//   ],
//   "razonamiento": "opcional — 1 línea explicando por qué Maria tomó esta decisión (para debug)"
// }
//
// Uso:
//   const { construirPrompt } = require('./prompt-builder');
//   const prompt = await construirPrompt({
//     canal: 'whatsapp',
//     entrada: { de: '541...@c.us', nombre: 'Diego', cuerpo: 'qué tengo mañana?', esAudio: false }
//   });

const fs = require('fs');
const path = require('path');
const mem = require('./memory');
const g   = require('./google');

const INSTRUCCIONES_PATH = process.env.INSTRUCCIONES_PATH || path.join(__dirname, 'instrucciones.txt');
const TZ = process.env.MARIA_TZ || 'America/Argentina/Buenos_Aires';

const DIAS_SEMANA = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
const MESES       = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

// ─── Secciones del prompt ─────────────────────────────────────────────────

function seccionInstrucciones() {
  try {
    const t = fs.readFileSync(INSTRUCCIONES_PATH, 'utf8').trim();
    return t || '(sin instrucciones base)';
  } catch {
    return '(no se pudo leer instrucciones.txt)';
  }
}

function seccionFechaHora() {
  const ahora = new Date();
  // Formato localizado "sábado 18 de abril de 2026, 16:32"
  const str = ahora.toLocaleString('es-AR', {
    timeZone: TZ,
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
  return `Ahora: ${str} (zona ${TZ}). ISO: ${ahora.toISOString()}`;
}

async function seccionAgenda({ dias = 7 } = {}) {
  let eventos;
  try { eventos = await g.listarEventosProximos({ dias, max: 30 }); }
  catch (err) { return `(error leyendo calendario: ${err.message})`; }
  if (!eventos.length) return '(sin eventos en los próximos ' + dias + ' días)';
  return eventos.map(e => {
    const cuando = _formatearFechaEvento(e);
    const lugar  = e.ubicacion ? ` — @${e.ubicacion}` : '';
    const meet   = e.meetLink ? ` [meet]` : '';
    return `- [${e.id}] ${cuando}  ${e.summary}${lugar}${meet}`;
  }).join('\n');
}

function _formatearFechaEvento(e) {
  if (e.allDay) {
    // "2026-04-20" → "lun 20/04"
    const d = new Date(e.start + 'T00:00:00');
    return `${DIAS_SEMANA[d.getDay()].slice(0,3)} ${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')} (todo el día)`;
  }
  const d = new Date(e.start);
  const hh = d.toLocaleTimeString('es-AR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
  // Mostrar también hora de fin para que Claude detecte solapamientos de un vistazo.
  let rango = hh;
  if (e.end) {
    const df = new Date(e.end);
    const hhFin = df.toLocaleTimeString('es-AR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
    rango = `${hh}-${hhFin}`;
  }
  return `${DIAS_SEMANA[d.getDay()].slice(0,3)} ${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')} ${rango}`;
}

async function seccionEmails({ max = 10 } = {}) {
  let emails;
  try { emails = await g.listarEmailsNoLeidos({ max }); }
  catch (err) { return `(error leyendo Gmail: ${err.message})`; }
  if (!emails.length) return '(sin emails no leídos)';
  return emails.map(e => `- [${e.id}] De: ${e.de} | "${e.asunto}" | ${_cortar(e.snippet, 120)}`).join('\n');
}

function seccionHistorial({ horas = 48, max = 50 } = {}) {
  return mem.contextoCrossCanal({ desdeHoras: horas, max });
}

function seccionPendientes({ tipo = null } = {}) {
  let p = mem.listarPendientes();
  if (tipo) p = p.filter(x => (x.meta?.tipo || 'consulta') === tipo);
  if (!p.length) {
    if (tipo === 'tarea')    return '(sin tareas activas)';
    if (tipo === 'consulta') return '(sin consultas abiertas)';
    return '(sin pendientes)';
  }
  return p.map(item => {
    const partes = [`[id:${item.id}] ${item.desc}`];
    if (item.creado) partes.push(`desde ${String(item.creado).slice(0,16).replace('T',' ')}`);
    if (item.meta?.remitente)    partes.push(`remitente: ${item.meta.remitente}`);
    if (item.meta?.canal_origen) partes.push(`canal: ${item.meta.canal_origen}`);
    if (item.meta?.de)           partes.push(`destino: ${item.meta.de}`);
    if (item.meta?.messageId)    partes.push(`email_id: ${item.meta.messageId}`);
    return partes.length === 1 ? partes[0] : `${partes[0]} (${partes.slice(1).join(' · ')})`;
  }).join('\n');
}

function seccionLibreta() {
  const todos = mem.todosLosContactos();
  if (!todos.length) return '(libreta vacía)';
  return todos.map(c => {
    const campos = [c.nombre];
    if (c.whatsapp) campos.push(`WA: ${c.whatsapp}`);
    if (c.email)    campos.push(`email: ${c.email}`);
    if (c.notas)    campos.push(`(${c.notas})`);
    return '- ' + campos.join(' | ');
  }).join('\n');
}

function seccionHechos() {
  const hs = mem.listarHechos();
  if (!hs.length) return '(sin hechos guardados todavía)';
  return hs.map(h => {
    const fuente = h.fuente ? ` [${h.fuente}]` : '';
    return `- ${h.clave}: ${h.valor}${fuente}`;
  }).join('\n');
}

function seccionProgramados({ max = 10 } = {}) {
  const ps = mem.proximosProgramados({ max });
  if (!ps.length) return '(no hay mensajes programados)';
  return ps.map(p => {
    // formatear cuando como "lun 20/04 06:30"
    const d = new Date(p.cuando);
    const cuando = `${DIAS_SEMANA[d.getDay()].slice(0,3)} ${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')} ${d.toLocaleTimeString('es-AR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })}`;
    const razon = p.razon ? ` [${p.razon}]` : '';
    const txt = (p.texto || '').replace(/\s+/g, ' ').slice(0, 100);
    return `- [id:${p.id}] ${cuando} → ${p.canal}/${p.destino}${razon}: ${txt}`;
  }).join('\n');
}

function seccionContacto({ de, nombre, email }) {
  // Buscar por identificadores disponibles
  let c = null;
  if (nombre) c = mem.buscarContacto({ nombre });
  if (!c && de)    c = mem.buscarContacto({ whatsapp: de });
  if (!c && email) c = mem.buscarContacto({ email });
  if (!c) return `(contacto no registrado — id: ${nombre || de || email || 'desconocido'})`;
  const partes = [
    `Nombre: ${c.nombre}`,
    c.whatsapp ? `WA: ${c.whatsapp}` : null,
    c.email    ? `Email: ${c.email}` : null,
    c.notas    ? `Notas: ${c.notas}` : null,
  ].filter(Boolean);
  return partes.join(' | ');
}

function seccionMensajeEntrante({ canal, entrada }) {
  const { de, nombre, asunto, cuerpo, esAudio, messageId } = entrada;
  const lineas = [`Canal: ${canal}`];
  if (nombre) lineas.push(`De: ${nombre}${de ? ` (${de})` : ''}`);
  else if (de) lineas.push(`De: ${de}`);
  if (asunto) lineas.push(`Asunto: ${asunto}`);
  if (messageId) lineas.push(`ID: ${messageId}`);
  if (esAudio) lineas.push(`Tipo: audio (transcripto automáticamente)`);
  lineas.push(``);
  lineas.push(`Mensaje:`);
  lineas.push(cuerpo || '(vacío)');
  return lineas.join('\n');
}

// ─── Prompt completo ──────────────────────────────────────────────────────

function seccionFormatoCanal(canal) {
  if (canal === 'whatsapp') {
    return `Estás respondiendo por WhatsApp. Reglas de formato:
- Para negrita usá *asterisco simple* (NUNCA **doble** — WA lo muestra literal).
- Para cursiva _guión bajo_.
- Para monoespaciado \`backtick\`.
- NO uses títulos (#, ##), listas markdown con guiones, ni tablas.
- Para listas usá emojis o números. Saltos de línea simples funcionan bien.
- Mensajes cortos, tono cercano — estás hablando por chat, no escribiendo un email.`;
  }
  if (canal === 'gmail') {
    return `Estás respondiendo por email. Reglas de formato:
- Texto plano. Sin markdown, sin HTML.
- Saludo corto al principio (sin "Estimado/a"; "Hola {nombre}," está bien).
- Firma exacta según [INSTRUCCIONES BASE]. No agregues nada después de la firma.
- Párrafos cortos, separados por línea en blanco.`;
  }
  return '(canal sin reglas específicas de formato)';
}

async function construirPrompt({ canal, entrada, horasHistorial = 48, diasAgenda = 7 }) {
  const [agenda, emails] = await Promise.all([
    seccionAgenda({ dias: diasAgenda }),
    seccionEmails({ max: 10 }),
  ]);
  const instrucciones = seccionInstrucciones();
  const fecha         = seccionFechaHora();
  const historial     = seccionHistorial({ horas: horasHistorial });
  const consultas     = seccionPendientes({ tipo: 'consulta' });
  const tareas        = seccionPendientes({ tipo: 'tarea' });
  const hechos        = seccionHechos();
  const programados   = seccionProgramados({ max: 10 });
  const libreta       = seccionLibreta();
  const contacto      = seccionContacto({
    de: entrada.de,
    nombre: entrada.nombre,
    email: entrada.email || (canal === 'gmail' ? entrada.de : null),
  });
  const mensaje       = seccionMensajeEntrante({ canal, entrada });
  const formato       = seccionFormatoCanal(canal);

  return `Sos Maria, la secretaria personal de Diego. Tenés memoria persistente y acceso a WhatsApp, Gmail y Google Calendar.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[INSTRUCCIONES BASE]
${instrucciones}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[FECHA Y HORA]
${fecha}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[AGENDA DE DIEGO — próximos ${diasAgenda} días]
${agenda}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[EMAILS NO LEÍDOS]
${emails}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[HISTORIAL CROSS-CANAL — últimas ${horasHistorial}hs]
(→ entrante, ← saliente, · interno; WA=WhatsApp, GMAIL, CAL=Calendar, SIS=Sistema)
${historial}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[CONSULTAS ABIERTAS — cosas que te preguntó un tercero y necesitás input de Diego, o que Diego te pidió preguntarle a alguien]
(Se cierran cuando Diego o el tercero responde. Emití quitar_pendiente apenas se resuelva.)
${consultas}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[TAREAS DE DIEGO — cosas que él mismo anotó y va a hacer él]
(Son SUS tareas personales — vos sos el inbox. SOLO las cerrás si Diego dice explícitamente "listo", "hecho", "ya", "completé", "terminé", "cerrá X" sobre una tarea puntual. NUNCA cierres por "dale", "bueno", "después", "lo veo", "avanzo", "me encargo" — eso es ack, no cierre. Ante cualquier duda, dejala abierta.)
${tareas}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[HECHOS SOBRE DIEGO — preferencias/datos que te pidió recordar]
(Usá esto como contexto permanente: preferencias, restricciones, datos personales
que le sirven a Diego que vos recuerdes entre conversaciones.)
${hechos}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[MENSAJES PROGRAMADOS — cola de envíos diferidos]
(Esto es lo que ya está agendado para mandarse en el futuro. NO vuelvas a programar
lo mismo si ya aparece acá. Si Diego pide cancelar, usá el id entre corchetes.)
${programados}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[LIBRETA DE CONTACTOS]
(Usá estos WA ids / emails para escribirle a alguien. Si un nombre no está acá
pero te escribió antes por WA, el wa id lo podés recuperar del [HISTORIAL].)
${libreta}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[CONTACTO QUE TE ESCRIBE AHORA]
${contacto}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[FORMATO DE RESPUESTA — CANAL ${canal.toUpperCase()}]
${formato}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[MENSAJE ENTRANTE]
${mensaje}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[TU TAREA]

Analizá el mensaje en el contexto de todo lo de arriba (agenda, emails, historial, pendientes) y respondé.

IMPORTANTE: Tu respuesta TIENE que ser un único objeto JSON válido, sin texto antes ni después, sin markdown, sin \`\`\`. Schema:

{
  "respuesta": "string - el texto que le vas a mandar al usuario por el mismo canal que entró el mensaje. Tono conversacional, como secretaria cercana, no formal.",
  "acciones": [ /* array de 0+ acciones a ejecutar después de mandar la respuesta */ ],
  "razonamiento": "string opcional - 1 línea, para debug"
}

Tipos de acción disponibles:

  { "tipo": "crear_evento", "summary": "título", "start": "2026-04-20T10:00:00-03:00", "end": "2026-04-20T11:00:00-03:00", "descripcion": "opcional", "ubicacion": "opcional", "attendees": ["email@..."], "meet": true|false, "forzar": false }
      // meet: default true si tiene hora (genera link de Google Meet automático). Pasá false para recordatorios personales sin invitados.
      // forzar: default false. Solo usá "forzar": true si Diego confirmó explícitamente que quiere pisar un evento existente.
  { "tipo": "modificar_evento", "id": "<id>", "summary": "...", "start": "...", "end": "...", "forzar": false }   // solo los campos que cambian; "forzar" saltea check de conflicto
  { "tipo": "borrar_evento", "id": "<id>" }
  { "tipo": "responder_email", "messageId": "<id del email>", "texto": "..." }
  { "tipo": "enviar_wa", "a": "541...@c.us", "texto": "..." }
  { "tipo": "agregar_pendiente", "desc": "...", "meta": { "tipo": "consulta"|"tarea", "remitente": "Natali", "canal_origen": "gmail", "messageId": "...", "de": "..." } }
      // meta.tipo = "consulta"  → hay que preguntarle/responderle a alguien (Diego o tercero). Se cierra cuando se resuelve.
      // meta.tipo = "tarea"     → Diego mismo te lo dicta como recordatorio propio. Solo se cierra con "listo/hecho/ya/completé/terminé".
      // Si no ponés tipo, se asume "consulta".
  { "tipo": "quitar_pendiente", "id": 42 }      // usá el id entre corchetes [id:N] de [CONSULTAS ABIERTAS] o [TAREAS DE DIEGO]. También podés pasar "desc" literal.
  { "tipo": "upsert_contacto", "nombre": "...", "whatsapp": "...", "email": "...", "notas": "..." }
  { "tipo": "programar_mensaje", "cuando": "2026-04-20T06:30:00-03:00", "canal": "whatsapp", "destino": "541132317896@c.us", "asunto": null, "texto": "...", "razon": "usuario" }   // programa un mensaje para mandarlo en el futuro. canal = "whatsapp" | "gmail". razon libre (ej. "usuario", "recordatorio", "seguimiento").
  { "tipo": "cancelar_programado", "id": 42 }   // cancela un mensaje programado por id (ver [MENSAJES PROGRAMADOS])
  { "tipo": "recordar_hecho", "clave": "preferencia_desayuno", "valor": "café negro sin azúcar", "fuente": "WA 2026-04-19" }   // guarda/actualiza un hecho durable sobre Diego (preferencias, datos, restricciones).
  { "tipo": "olvidar_hecho", "clave": "preferencia_desayuno" }   // borra un hecho que ya no aplica

Reglas:
- Si el mensaje es de Diego y te pide agendar/modificar algo: hacelo directo con crear_evento/modificar_evento.
- AGENDA SIN PISAR: Antes de crear o mover un evento, chequeá en [AGENDA DE DIEGO] que el rango start→end NO se superponga con otro evento CON HORA (cada uno muestra "HH:MM-HH:MM"). Los eventos "(todo el día)" son contexto (ubicación, viaje, feriado, cumple) y NO bloquean — podés agendar reuniones en un día que ya tenga un all-day. Si detectás conflicto real (horario pisa con otro horario):
    · Con Diego pidiéndolo directo: respondele "ya tenés X a esa hora — ¿lo piso, lo movemos, o te ofrezco otro horario?" y NO emitas crear_evento todavía (esperá su respuesta). Si Diego confirma pisar ("pisalo", "metelo igual", "dale", "sí piso"), emití crear_evento con "forzar": true — el sistema no te va a rebotar.
    · Con un tercero negociando una reunión: NUNCA le confirmes un horario sin antes verificar el slot. Si el horario que el tercero propone está ocupado, ofrecele 2-3 alternativas tomadas de los huecos libres de la agenda ("esa hora no me funciona, ¿te sirve mañana 11hs o 15hs?"). Solo comprometé un horario cuando sepas que está libre. El "forzar": true es solo para cuando Diego te dio OK explícito — nunca uses forzar con un tercero.
- REUNIONES CON MEET: Cuando crees un evento que es una reunión (con attendees, o que el contexto indique "reunión"/"llamada"/"meet"/"videollamada"), NO hace falta que pidas Meet — se agrega automático con conferenceData. Si el evento es un recordatorio personal sin invitados (ej. "recordame ir al banco"), pasá "meet": false para no generar link inútil. En tu respuesta podés mencionar "te paso el link por Calendar" — Google le manda la invitación con el Meet adentro a todos los attendees.
- LENGUAJE TENTATIVO (importante, evita mentir): Vos respondés ANTES de que se ejecuten las acciones — o sea, en el momento de escribir la "respuesta" todavía no sabés si el crear_evento / modificar_evento / responder_email / enviar_wa funcionó. Por eso, cuando vas a emitir una acción, usá tiempo futuro en la respuesta, NO pasado ni "listo/hecho":
    · ✅ "te la agendo" / "le respondo ahora" / "te la paso a las 15" / "le escribo a Juan"
    · ❌ "listo, agendada" / "ya le respondí" / "se la pasé" / "ya le escribí a Juan"
  Si la acción falla, el próximo mensaje te va a llegar con el error en el [HISTORIAL] como evento del canal "sistema" — ahí le avisás a Diego que no pudo completarse y le ofrecés alternativa.
- RESPUESTA VACÍA ES OK (no respondas por respuesta): No estás obligada a contestar siempre. Si el mensaje entrante es un ack sin acción requerida ("dale", "ok", "gracias", "perfecto", "no te preocupes, ya está"), o si tu respuesta solo repetiría algo que ya dijiste, devolvé respuesta: "" y el sistema no manda nada. Podés tener respuesta vacía Y acciones al mismo tiempo (ej. quitar_pendiente sin hablarle al usuario). Mejor callarte que mandar un mensaje decorativo.
- NO MANDES REDUNDANCIA a terceros: Antes de escribirle a una persona, mirá [HISTORIAL CROSS-CANAL] y fijate cuál fue tu último mensaje saliente a ese contacto. Si la info que ibas a mandar ahora ya está cubierta en ese último mensaje (horarios ya ofrecidos, pregunta ya hecha, "lo consulto y te aviso" ya dicho), NO mandes nada nuevo — quedaría redundante o contradictorio. Solo volvé a escribirle cuando tengas info genuinamente nueva (confirmación final, cambio de horario, nueva alternativa).
    · Caso clásico: venís negociando con un tercero (le ofreciste horarios y estás esperando su elección) → mientras tanto le preguntás a Diego → Diego te da OK → NO le remandás al tercero lo que ya estaba en su cancha. Hacés quitar_pendiente de la consulta interna y listo. La pelota ya estaba del lado del tercero.
- Si es de un tercero pidiendo algo que requiere a Diego (reunión, decisión, permiso, confirmación): NO resuelvas sin consultarle. Emití DOS acciones en conjunto:
    1) enviar_wa a Diego (usá "a": "541132317896@c.us" — el sistema resuelve el @lid automáticamente) con la pregunta concreta y el contexto mínimo.
    2) agregar_pendiente con desc = lo que le debés contestar al tercero, y meta = { remitente, canal_origen, messageId (si es email), de }.
  Al tercero respondele algo breve tipo "lo consulto con Diego y te confirmo". NO le confirmes ni inventes respuesta en nombre de Diego.
- Si Diego te responde a una CONSULTA (la ves en [CONSULTAS ABIERTAS] o en el historial): ejecutá lo que dijo Y emití un quitar_pendiente con el id del pendiente resuelto. Para saber A QUIÉN escribirle:
    · Si el pendiente tiene "destino:" (meta.de), usalo tal cual en "a" del enviar_wa (o en el To del responder_email).
    · Si no hay destino pero tenés el nombre del remitente, buscalo en [LIBRETA DE CONTACTOS] y usá su WA id / email.
    · NUNCA le pidas a Diego el número si el tercero ya te escribió — su wa id está en la libreta o en el historial. Si de verdad no lo encontrás, avisale a Diego que no lo tenés pero NO frenes la respuesta pidiéndoselo; dejá el pendiente abierto.
- TAREAS de Diego: son distintas de consultas. Agregalas con meta.tipo="tarea" cuando Diego te dicta algo para sí mismo ("acordate que tengo que X", "anotá: hacer Y", "agregá Z al pendiente", "te dejo esto pendiente mío"). NO las cierres a menos que Diego diga textualmente "listo X", "hecho X", "ya hice X", "completé X", "terminé X", "cerrá X" — refiriéndose a esa tarea específica. Si dice "dale", "bueno", "veo", "después", "avanzo", "me encargo", "más tarde" → NO es cierre, es ack, dejala abierta.
- Si ya hay un pendiente en la cola para el mismo remitente y misma consulta/tarea, NO lo dupliques.
- Si ves un email no leído relevante al mensaje actual, mencionalo en la respuesta.
- Fechas/horas SIEMPRE en ISO con timezone (-03:00 para Argentina).
- Si no hay nada que hacer más que responder, "acciones": [].
- No inventes IDs. Los ids de agenda van entre corchetes en [AGENDA]. Los messageId de emails SOLO son válidos si vienen en [EMAILS NO LEÍDOS] o en el [MENSAJE ENTRANTE] actual (campo ID). Si no tenés el id explícito NO emitas responder_email — mandale un enviar_wa a Diego mejor.

Internet:
- Tenés WebSearch y WebFetch disponibles. Usalos libremente cuando necesites info externa: teléfono/dirección/horario de un restaurante o local, datos públicos de una empresa o persona, horarios de vuelos, clima, etc.
- No busques info privada de Diego en la web. No inventes si no encontrás — decí que no lo encontraste.

Hechos persistentes (recordar_hecho / olvidar_hecho):
- Si Diego te dice algo que es una preferencia durable, una restricción, un dato personal que va a servir en el futuro ("no tomo café después de las 4", "mi dentista se llama Laura", "prefiero reuniones de 30 min, no 1hs", "soy alérgico al maní"), emití recordar_hecho con una clave corta en snake_case y el valor en texto libre. NO guardes datos efímeros (estado de ánimo hoy, qué comió al mediodía, dónde está ahora mismo) — esos van al historial, no a hechos.
- Si un hecho guardado ya no aplica o Diego lo corrige, emití olvidar_hecho con la clave vieja y recordar_hecho con la nueva si corresponde.
- Antes de crear una clave nueva, fijate si ya hay una similar en [HECHOS SOBRE DIEGO] y actualizala en vez de duplicar.

Mensajes programados (programar_mensaje / cancelar_programado):
- Si Diego te pide "recordame a las 17 que llame a X", "mandame un WA mañana a la mañana con tal cosa", "si no te responde para el martes, insistile", emití programar_mensaje con la fecha/hora ISO con timezone (-03:00 para Argentina), canal ('whatsapp' o 'gmail'), destino (wa id o email — si es Diego usá "541132317896@c.us" y el sistema resuelve el @lid), y razón libre (ej. "recordatorio", "seguimiento").
- Antes de programar, fijate en [MENSAJES PROGRAMADOS] si ya hay algo equivalente para no duplicar.
- Si Diego pide cancelar, usá cancelar_programado con el id que aparece entre corchetes en [MENSAJES PROGRAMADOS].
- NO uses programar_mensaje para el brief matutino ni para avisos de reuniones — esos los maneja el sistema solo.

Contactos (gestión autónoma):
- Si te llega por cualquier canal info nueva de un contacto (nombre+teléfono, nombre+email, o actualización de alguno existente) O si buscaste en web y encontraste el contacto de un lugar/persona que puede serle útil a Diego a futuro, emití upsert_contacto para guardarlo. Ejemplos:
    · Alguien te escribe por primera vez desde un email que no tenías → guardá nombre + email.
    · Diego te pide buscar el teléfono de "La Parolaccia Palermo" → después de la búsqueda, emití upsert_contacto({ nombre: "La Parolaccia Palermo", whatsapp: "...", notas: "restaurante — dirección ..." }).
    · Un remitente menciona su mail/tel en la firma y no coincide con el que tenías → actualizá con upsert_contacto (el upsert no pisa datos existentes con null).
- Cuando tengas dudas del nombre canónico, usá el que ya usa Diego para referirse a esa persona/lugar.

Devolvé SOLO el JSON, nada más.`;
}

function _cortar(s, n) {
  if (!s) return '';
  s = String(s).replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

module.exports = {
  construirPrompt,
  // exportados para test / debug
  seccionInstrucciones,
  seccionFechaHora,
  seccionAgenda,
  seccionEmails,
  seccionHistorial,
  seccionPendientes,
  seccionContacto,
  seccionMensajeEntrante,
};
