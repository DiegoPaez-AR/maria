// prompt-builder.js — arma el prompt completo que va a `claude -p`
//
// Maria sirve a varios usuarios con fuerte aislamiento. Este builder recibe
// `usuario` (id, nombre, rol, calendar_id, tz, ...) y TODO el contexto se
// filtra por ese usuario_id. Maria nunca ve info de otros usuarios mientras
// está trabajando para éste.
//
// El JSON esperado de Claude sigue siendo el mismo (ver lista de acciones
// abajo). Las acciones nuevas para el owner son:
//   - crear_usuario (owner-only)
//   - borrar_usuario (owner-only)

const fs = require('fs');
const path = require('path');
const mem = require('./memory');
const g   = require('./google');
const usuarios = require('./usuarios');
const unknownFlow = require('./unknown-flow');

const INSTRUCCIONES_PATH = process.env.INSTRUCCIONES_PATH || path.join(__dirname, 'instrucciones.txt');

const DIAS_SEMANA = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
const MESES       = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

// ─── Secciones ────────────────────────────────────────────────────────────

function seccionInstrucciones() {
  try {
    const t = fs.readFileSync(INSTRUCCIONES_PATH, 'utf8').trim();
    return t || '(sin instrucciones base)';
  } catch {
    return '(no se pudo leer instrucciones.txt)';
  }
}

function seccionFechaHora(tz) {
  const ahora = new Date();
  const str = ahora.toLocaleString('es-AR', {
    timeZone: tz,
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
  return `Ahora: ${str} (zona ${tz}). ISO: ${ahora.toISOString()}`;
}

async function seccionAgenda(usuario, { dias = 7 } = {}) {
  let eventos;
  try {
    eventos = await g.listarEventosProximos({ dias, max: 30, calendarId: usuario.calendar_id });
  } catch (err) {
    return `(error leyendo calendario: ${err.message})`;
  }
  if (!eventos.length) return `(sin eventos en los próximos ${dias} días)`;
  return eventos.map(e => {
    const cuando = _formatearFechaEvento(e, usuario.tz);
    const lugar  = e.ubicacion ? ` — @${e.ubicacion}` : '';
    const meet   = e.meetLink ? ` [meet]` : '';
    return `- [${e.id}] ${cuando}  ${e.summary}${lugar}${meet}`;
  }).join('\n');
}

function _formatearFechaEvento(e, tz) {
  if (e.allDay) {
    const d = new Date(e.start + 'T00:00:00');
    return `${DIAS_SEMANA[d.getDay()].slice(0,3)} ${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')} (todo el día)`;
  }
  const d = new Date(e.start);
  const hh = d.toLocaleTimeString('es-AR', { timeZone: tz, hour: '2-digit', minute: '2-digit' });
  let rango = hh;
  if (e.end) {
    const df = new Date(e.end);
    const hhFin = df.toLocaleTimeString('es-AR', { timeZone: tz, hour: '2-digit', minute: '2-digit' });
    rango = `${hh}-${hhFin}`;
  }
  return `${DIAS_SEMANA[d.getDay()].slice(0,3)} ${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')} ${rango}`;
}

function seccionHistorial(usuario, { horas = 48, max = 50 } = {}) {
  return mem.contextoCrossCanal(usuario.id, { desdeHoras: horas, max });
}

function seccionPendientes(usuario, { tipo = null } = {}) {
  let p = mem.listarPendientes(usuario.id);
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

function seccionLibreta(usuario) {
  const todos = mem.todosLosContactos(usuario.id);
  if (!todos.length) return '(libreta vacía)';
  return todos.map(c => {
    const campos = [c.nombre];
    if (c.whatsapp) campos.push(`WA: ${c.whatsapp}`);
    if (c.email)    campos.push(`email: ${c.email}`);
    if (c.notas)    campos.push(`(${c.notas})`);
    return '- ' + campos.join(' | ');
  }).join('\n');
}

function seccionHechos(usuario) {
  const hs = mem.listarHechos(usuario.id);
  if (!hs.length) return '(sin hechos guardados todavía)';
  return hs.map(h => {
    const fuente = h.fuente ? ` [${h.fuente}]` : '';
    return `- ${h.clave}: ${h.valor}${fuente}`;
  }).join('\n');
}

function seccionProgramados(usuario, { max = 10 } = {}) {
  const ps = mem.proximosProgramados(usuario.id, { max });
  if (!ps.length) return '(no hay mensajes programados)';
  return ps.map(p => {
    const d = new Date(p.cuando);
    const cuando = `${DIAS_SEMANA[d.getDay()].slice(0,3)} ${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')} ${d.toLocaleTimeString('es-AR', { timeZone: usuario.tz, hour: '2-digit', minute: '2-digit' })}`;
    const razon = p.razon ? ` [${p.razon}]` : '';
    const txt = (p.texto || '').replace(/\s+/g, ' ').slice(0, 100);
    return `- [id:${p.id}] ${cuando} → ${p.canal}/${p.destino}${razon}: ${txt}`;
  }).join('\n');
}

function seccionContacto(usuario, { de, nombre, email }) {
  let c = null;
  if (nombre) c = mem.buscarContacto({ usuarioId: usuario.id, nombre });
  if (!c && de)    c = mem.buscarContacto({ usuarioId: usuario.id, whatsapp: de });
  if (!c && email) c = mem.buscarContacto({ usuarioId: usuario.id, email });
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

// ─── Prompt completo ──────────────────────────────────────────────────────

async function construirPrompt({ usuario, canal, entrada, horasHistorial = 48, diasAgenda = 7 }) {
  if (!usuario || !usuario.id) throw new Error('construirPrompt: usuario requerido');
  const tz = usuario.tz || 'America/Argentina/Buenos_Aires';

  const [agenda] = await Promise.all([
    seccionAgenda(usuario, { dias: diasAgenda }),
  ]);
  const instrucciones = seccionInstrucciones();
  const fecha         = seccionFechaHora(tz);
  const historial     = seccionHistorial(usuario, { horas: horasHistorial });
  const consultas     = seccionPendientes(usuario, { tipo: 'consulta' });
  const tareas        = seccionPendientes(usuario, { tipo: 'tarea' });
  const hechos        = seccionHechos(usuario);
  const programados   = seccionProgramados(usuario, { max: 10 });
  const libreta       = seccionLibreta(usuario);
  const contacto      = seccionContacto(usuario, {
    de: entrada.de,
    nombre: entrada.nombre,
    email: entrada.email || (canal === 'gmail' ? entrada.de : null),
  });
  const mensaje = seccionMensajeEntrante({ canal, entrada });
  const formato = seccionFormatoCanal(canal);

  // Dinámico según rol
  const esOwner = usuario.rol === 'owner';
  const listaUsuarios = usuarios.listarActivos().map(u => `${u.id}: ${u.nombre}${u.rol === 'owner' ? ' (owner)' : ''}${u.calendar_id ? '' : ' [sin calendar]'}`).join(', ');

  // Prospectos pendientes de confirmación (sólo relevante para el owner).
  const prospectos = esOwner ? unknownFlow.listarProspectosPendientes() : [];
  const seccionProspectos = esOwner
    ? (prospectos.length
        ? prospectos.map(p => {
            const cuando = String(p.ts || p.actualizado || '').slice(0, 16).replace('T', ' ');
            const sug = p.nombre_sugerido || '(sin nombre detectado)';
            const wa  = p.wa_cus_sugerido ? ` wa_cus=${p.wa_cus_sugerido}` : '';
            const em  = p.email_sugerido  ? ` email=${p.email_sugerido}`  : '';
            const msg = (p.original_body || '').replace(/\s+/g, ' ').slice(0, 160);
            const razon = p.razon ? ` · razón: ${p.razon}` : '';
            return `- [${p.canal}|${p.remitente_id}] desde ${cuando} · sugerido: "${sug}"${wa}${em}${razon}\n  mensaje: "${msg}"`;
          }).join('\n')
        : '(no hay prospectos pendientes)')
    : '';

  const accionesOwner = esOwner ? `
  { "tipo": "crear_usuario", "nombre": "Nombre", "wa_cus": "549XXX...@c.us" (opcional), "email": "...@..." (opcional), "calendar_id": "email@..." (opcional, completar después con actualizar_usuario cuando comparta su calendar), "tz": "America/..." (opcional), "brief_hora": "07" (opcional), "brief_minuto": "00" (opcional) }
      // Solo owner. Crea un nuevo usuario. Sin calendar_id puede existir como "prospecto" pero no se le pueden crear eventos hasta que lo complete.
  { "tipo": "actualizar_usuario", "id": 3, "nombre": "...", "wa_cus": "...", "email": "...", "calendar_id": "...", "tz": "...", "brief_hora": "...", "brief_minuto": "..." }
      // Solo owner. Cambia campos parciales de un usuario existente (ej. agregar calendar_id cuando finalmente lo compartió).
  { "tipo": "borrar_usuario", "id": 3 }
      // Solo owner. Desactiva al usuario (soft delete). No se puede borrar al owner.
  { "tipo": "confirmar_prospecto_pendiente", "canal": "whatsapp"|"gmail", "remitente_id": "<id del remitente>", "nombre": "Nombre si querés pisar el sugerido" (opcional), "wa_cus": "..." (opcional), "email": "..." (opcional), "calendar_id": "..." (opcional) }
      // Solo owner. Confirma la creación de un prospecto detectado en [PROSPECTOS PENDIENTES]. Crea el usuario con los datos sugeridos (pisables por los que pases acá).
  { "tipo": "rechazar_prospecto_pendiente", "canal": "whatsapp"|"gmail", "remitente_id": "<id del remitente>" }
      // Solo owner. Descarta el prospecto (el remitente queda como desconocido; si vuelve a escribir, arrancamos de cero).` : '';

  const lineaOwner = esOwner
    ? `Además sos OWNER: podés crear / actualizar / borrar usuarios, y confirmar o rechazar prospectos pendientes. Usuarios activos actualmente: ${listaUsuarios}.`
    : '';

  return `Sos Maria, secretaria personal con memoria persistente y acceso a WhatsApp, Gmail y Google Calendar. Servís a varios usuarios desde una misma instancia.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[USUARIO QUE ESTÁS ATENDIENDO]
Estás trabajando PARA ${usuario.nombre} (id=${usuario.id}, rol=${usuario.rol}).
${lineaOwner}

REGLA DE AISLAMIENTO (dura):
- Todo el contexto de este prompt (agenda, historial, pendientes, contactos, hechos, programados) pertenece EXCLUSIVAMENTE a ${usuario.nombre}.
- NUNCA compartas información de OTROS usuarios con ${usuario.nombre}. Los demás usuarios son privados entre sí. Si ${usuario.nombre} pregunta por otro usuario, respondé que por política no compartís info de otras personas que asistís.
- Cualquier acción que emitas (crear_evento, responder_email, enviar_wa, agregar_pendiente, recordar_hecho, etc.) se guarda asociada a ${usuario.nombre}.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[INSTRUCCIONES BASE]
${instrucciones}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[FECHA Y HORA]
${fecha}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[AGENDA DE ${usuario.nombre.toUpperCase()} — próximos ${diasAgenda} días]
${agenda}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[HISTORIAL CROSS-CANAL DE ${usuario.nombre.toUpperCase()} — últimas ${horasHistorial}hs]
(→ entrante, ← saliente, · interno; WA=WhatsApp, GMAIL, CAL=Calendar, SIS=Sistema)
${historial}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[CONSULTAS ABIERTAS — cosas que preguntó un tercero y necesitás input de ${usuario.nombre}, o que ${usuario.nombre} te pidió preguntarle a alguien]
(Se cierran cuando ${usuario.nombre} o el tercero responde. Emití quitar_pendiente apenas se resuelva.)
${consultas}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[TAREAS DE ${usuario.nombre.toUpperCase()} — cosas que ${usuario.nombre} se anotó para hacer]
(Son SUS tareas personales — vos sos el inbox. SOLO las cerrás si ${usuario.nombre} dice explícitamente "listo", "hecho", "ya", "completé", "terminé", "cerrá X" sobre una tarea puntual. NUNCA cierres por "dale", "bueno", "después", "lo veo", "avanzo", "me encargo" — eso es ack, no cierre. Ante cualquier duda, dejala abierta.)
${tareas}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[HECHOS SOBRE ${usuario.nombre.toUpperCase()} — preferencias/datos que te pidió recordar]
${hechos}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[MENSAJES PROGRAMADOS — cola de envíos diferidos de ${usuario.nombre}]
${programados}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[LIBRETA DE CONTACTOS DE ${usuario.nombre.toUpperCase()}]
${libreta}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[CONTACTO QUE TE ESCRIBE AHORA]
${contacto}
${esOwner ? `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[PROSPECTOS PENDIENTES DE CONFIRMACIÓN — sólo vos (owner) los podés cerrar]
(Remitentes desconocidos que el LLM sospecha que son alguien que me pediste agregar. Cada uno espera que le digas "sí creá" o "no descartá". Los cerrás con \`confirmar_prospecto_pendiente\` o \`rechazar_prospecto_pendiente\` — nunca creas usuarios automáticamente. Si ${usuario.nombre} te habla sobre uno, interpretá su respuesta y emití la acción.)
${seccionProspectos}
` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[FORMATO DE RESPUESTA — CANAL ${canal.toUpperCase()}]
${formato}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[MENSAJE ENTRANTE]
${mensaje}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[TU TAREA]

Analizá el mensaje en el contexto de todo lo de arriba y respondé.

IMPORTANTE: Tu respuesta TIENE que ser un único objeto JSON válido, sin texto antes ni después, sin markdown, sin \`\`\`. Schema:

{
  "respuesta": "string - el texto que le vas a mandar al usuario por el mismo canal. Tono conversacional, como secretaria cercana.",
  "acciones": [ /* array de 0+ acciones a ejecutar después de mandar la respuesta */ ],
  "razonamiento": "string opcional - 1 línea, para debug"
}

Tipos de acción disponibles:

  { "tipo": "crear_evento", "summary": "título", "start": "ISO", "end": "ISO", "descripcion": "opcional", "ubicacion": "opcional", "attendees": ["email@..."], "meet": true|false, "forzar": false }
  { "tipo": "modificar_evento", "id": "<id>", "summary": "...", "start": "...", "end": "...", "forzar": false }
  { "tipo": "borrar_evento", "id": "<id>" }
  { "tipo": "responder_email", "messageId": "<id>", "texto": "..." }
  { "tipo": "enviar_wa", "a": "541...@c.us", "texto": "..." }
  { "tipo": "agregar_pendiente", "desc": "...", "meta": { "tipo": "consulta"|"tarea", "remitente": "...", "canal_origen": "gmail", "messageId": "...", "de": "..." } }
  { "tipo": "quitar_pendiente", "id": 42 }
  { "tipo": "upsert_contacto", "nombre": "...", "whatsapp": "...", "email": "...", "notas": "..." }
  { "tipo": "programar_mensaje", "cuando": "ISO", "canal": "whatsapp"|"gmail", "destino": "...", "asunto": null, "texto": "...", "razon": "usuario" }
  { "tipo": "cancelar_programado", "id": 42 }
  { "tipo": "recordar_hecho", "clave": "snake_case", "valor": "...", "fuente": "..." }
  { "tipo": "olvidar_hecho", "clave": "..." }${accionesOwner}

Reglas:
- Si el mensaje es de ${usuario.nombre} y te pide agendar/modificar algo: hacelo directo con crear_evento/modificar_evento.
- AGENDA SIN PISAR: Antes de crear o mover un evento, chequeá en [AGENDA] que el rango start→end NO se superponga con otro evento CON HORA. Los eventos "(todo el día)" son contexto y NO bloquean. Si hay conflicto real:
    · Con ${usuario.nombre} pidiéndolo directo: preguntale "ya tenés X a esa hora — ¿lo piso, lo movemos, o te ofrezco otro horario?" y NO emitas crear_evento todavía. Si confirma ("pisalo", "sí piso"), emití con "forzar": true.
    · Con un tercero: NUNCA confirmes un horario sin verificar el slot. Ofrecé 2-3 alternativas de huecos libres.
- REUNIONES CON MEET: Default Meet on para eventos con hora. "meet": false solo para recordatorios personales sin invitados.
- LENGUAJE TENTATIVO: Las acciones se ejecutan DESPUÉS de tu respuesta. Usá futuro en el texto:
    · ✅ "te la agendo" / "le respondo ahora" / "le escribo a Juan"
    · ❌ "listo, agendada" / "ya le respondí" / "ya le escribí"
- RESPUESTA VACÍA ES OK: Si el mensaje es un ack sin acción ("dale", "ok", "gracias", "perfecto"), o tu respuesta solo repetiría algo ya dicho, devolvé respuesta: "". El sistema no manda nada.
- NO MANDES REDUNDANCIA a terceros: Si ya les dijiste algo y la pelota está en su cancha, NO vuelvas a escribirles hasta tener info nueva.
- Si es de un tercero pidiendo algo que requiere a ${usuario.nombre} (reunión, decisión): NO resuelvas sin consultarle. Emití:
    1) enviar_wa a ${usuario.nombre} (usá su wa del contacto) con la pregunta concreta.
    2) agregar_pendiente con desc = lo que le debés contestar al tercero, y meta con remitente, canal_origen, messageId, de.
  Al tercero respondele "lo consulto con ${usuario.nombre} y te confirmo". NO inventes respuesta en su nombre.
- Si ${usuario.nombre} te responde a una CONSULTA: ejecutá lo que dijo Y emití un quitar_pendiente con el id. Para saber a quién escribir:
    · Si el pendiente tiene "destino:", usalo.
    · Si no, buscá en [LIBRETA] por nombre.
- TAREAS: cerralas solo con "listo/hecho/ya/completé/terminé" explícito sobre esa tarea.
- No dupliques pendientes para mismo remitente + misma consulta.
- Fechas/horas SIEMPRE en ISO con timezone (${tz}).
- No inventes IDs. Los ids válidos vienen entre corchetes en [AGENDA] o en el [MENSAJE ENTRANTE] (campo ID).

Internet:
- Tenés WebSearch y WebFetch. Usalos para info pública (teléfonos, direcciones, clima, horarios, etc.).
- No busques info privada de ${usuario.nombre}. No inventes si no encontrás.

Hechos persistentes:
- Si ${usuario.nombre} te dice algo durable (preferencia, restricción, dato personal), emití recordar_hecho con clave en snake_case.
- No guardes efímero (estado de ánimo, comida del día).

Mensajes programados:
- Si pide "recordame a las 17", "insistile el martes", etc., emití programar_mensaje con ISO-${tz} y canal/destino.
- No uses programar_mensaje para el brief matutino ni avisos de reuniones — los maneja el sistema.

Contactos:
- Si te llega info nueva de un contacto (nombre+tel/email), emití upsert_contacto. Se guarda en la libreta de ${usuario.nombre}.

Devolvé SOLO el JSON, nada más.`;
}

// ─── Prompt especial para remitente desconocido ──────────────────────────
//
// Cuando alguien escribe a Maria y no matchea con ningún usuario activo,
// entramos en este modo: Maria le pregunta para quién va el mensaje.
// Si ya preguntó y el desconocido respondió, Maria trata de identificar
// al usuario destinatario del mensaje.

async function construirPromptDesconocido({ canal, entrada, estado, ownerUsuario }) {
  const activos = usuarios.listarActivos();
  const lista = activos.map(u => `- ${u.nombre}${u.rol === 'owner' ? ' (owner)' : ''}`).join('\n');

  const primeraVez = !estado; // todavía no le preguntamos
  const mensaje = seccionMensajeEntrante({ canal, entrada });

  const ownerWa = ownerUsuario?.wa_lid || ownerUsuario?.wa_cus || '';

  const contexto = primeraVez
    ? `Es la PRIMERA VEZ que este remitente te escribe. No sabés para quién va.`
    : `Ya le preguntaste antes ("${estado.ask_at}") y está respondiendo. El mensaje original que mandó era: "${estado.original_body}". Ahora te contesta.`;

  return `Sos Maria, secretaria que asiste a varios usuarios. Un REMITENTE DESCONOCIDO te acaba de escribir (no matchea con ningún usuario registrado).

Usuarios que asistís (privados entre sí, no reveles nombres salvo que sea estrictamente necesario para ruteo):
${lista || '(sin usuarios activos)'}

Canal: ${canal}
${contexto}

${mensaje}

TU TAREA:
${primeraVez
  ? `1. Respondé AMABLEMENTE pidiéndole que te diga para quién va el mensaje. Tono cálido, breve. No reveles la lista de usuarios — solo "para quién es este mensaje".
2. Emití una sola acción: enviar_wa a ${ownerWa} (el owner) avisándole que escribió un desconocido, citando brevemente el mensaje.`
  : `1. Tratá de identificar si el remitente está nombrando a alguno de los usuarios que asistís. Mirá nombres EXACTOS o primeros nombres. No inventes.
2. Si matcheás inequívocamente con un usuario: emití acción "rutear_a_usuario" con "id": <id>, y respondele al desconocido algo tipo "Listo, se lo paso. Gracias." Además emití enviar_wa al owner (${ownerWa}) avisando que routeaste.
3. Si NO matcheás o es ambiguo: respondé "Perdón, no conozco esa persona. Cierro acá." y emití acción "cerrar_desconocido" y enviar_wa al owner.`
}

IMPORTANTE: Respondé con JSON válido, sin markdown:
{
  "respuesta": "texto a mandar al desconocido (tono amable, breve)",
  "acciones": [ ... ],
  "razonamiento": "opcional"
}

Acciones disponibles en este modo:
  { "tipo": "enviar_wa", "a": "<wa del owner>", "texto": "..." }
  { "tipo": "rutear_a_usuario", "id": 2 }              // routea el mensaje original al usuario id
  { "tipo": "cerrar_desconocido" }                      // cierra el thread, limpia estado

Devolvé SOLO el JSON.`;
}

module.exports = {
  construirPrompt,
  construirPromptDesconocido,
  // exportados para test
  seccionInstrucciones,
  seccionFechaHora,
  seccionAgenda,
  seccionHistorial,
  seccionPendientes,
  seccionContacto,
  seccionMensajeEntrante,
};
