// action-schemas.js — FUENTE ÚNICA de las acciones de Maria expuestas como
// tools MCP (fase 2, killswitch MARIA_MCP_ACTIONS). Cada entrada es un tool con
// input_schema JSON. El `name` del tool === el `tipo` de la acción del executor.
// El mcp-actions-server arma { tipo: name, ...args } y pega a internal-api /accion.
//
// Nota: additionalProperties:true en todos — el executor sigue siendo el
// validador final; si falta/algo está mal, su error vuelve al modelo (que en
// tool-use lo ve y autocorrige). Los `required` acá replican los _requerir del
// executor para atajar los errores en origen (el objetivo de la fase 2).

const s = (description, extra = {}) => ({ type: 'string', description, ...extra });

const TOOLS = [
  {
    name: 'crear_evento',
    description: 'Crea un evento en el calendar. El executor elige en qué calendar según el tier de acceso. start/end en ISO 8601 con offset (ej. 2026-07-07T12:30:00-03:00).',
    inputSchema: { type: 'object', additionalProperties: true, required: ['summary', 'start', 'end'],
      properties: { summary: s('Título del evento'), start: s('Inicio ISO 8601'), end: s('Fin ISO 8601'),
        descripcion: s('Descripción (opcional)'), ubicacion: s('Ubicación (opcional)'),
        attendees: { type: 'array', items: { type: 'string' }, description: 'Emails de invitados' },
        meet: { type: 'boolean' }, forzar: { type: 'boolean', description: 'Ignorar chequeo de solapamiento' },
        para_usuario_id: { type: 'integer', description: 'Solo owner: crear para OTRO usuario' } } },
  },
  {
    name: 'modificar_evento',
    description: 'Modifica un evento existente por id. attendees se MERGEA con los existentes. Incluí SIEMPRE el campo que prometiste cambiar (start/end/ubicacion/attendees).',
    inputSchema: { type: 'object', additionalProperties: true, required: ['id'],
      properties: { id: s('id del evento'), summary: s(''), start: s('ISO'), end: s('ISO'), ubicacion: s(''),
        attendees: { type: 'array', items: { type: 'string' } }, forzar: { type: 'boolean' }, calendarId: s('override opcional') } },
  },
  {
    name: 'borrar_evento',
    description: 'Borra un evento por id. En tier read solo podés borrar eventos creados por vos (Maria).',
    inputSchema: { type: 'object', additionalProperties: true, required: ['id'],
      properties: { id: s('id del evento'), calendarId: s('override opcional') } },
  },
  {
    name: 'responder_email',
    description: 'Responde a un email ya recibido manteniendo el thread. Necesita messageId del mensaje entrante.',
    inputSchema: { type: 'object', additionalProperties: true, required: ['messageId', 'texto'],
      properties: { messageId: s('id del email a responder'), texto: s('cuerpo'), replyAll: { type: 'boolean' }, cc: s('opcional, string o lista') } },
  },
  {
    name: 'enviar_email',
    description: 'Envía un email NUEVO (sin thread previo). to/cc/bcc pueden ser string o lista.',
    inputSchema: { type: 'object', additionalProperties: true, required: ['to', 'asunto', 'texto'],
      properties: { to: s('destinatario'), asunto: s(''), texto: s('cuerpo'), cc: s('opcional'), bcc: s('opcional'), replyTo: s('opcional') } },
  },
  {
    name: 'enviar_wa',
    description: 'Envía un WhatsApp. `a` = wid destino (541...@c.us o @lid). El destinatario debe estar en libreta/ser usuario, o cargalo antes con upsert_contacto.',
    inputSchema: { type: 'object', additionalProperties: true, required: ['a', 'texto'],
      properties: { a: s('wid destino, ej. 5491...@c.us'), texto: s('mensaje') } },
  },
  {
    name: 'reenviar_wa',
    description: 'Forward NATIVO de WhatsApp de un mensaje existente (cualquier tipo de archivo). Necesita el wa_msg_id original (viene como [wa_msg_id=...] en el historial).',
    inputSchema: { type: 'object', additionalProperties: true, required: ['messageId', 'a'],
      properties: { messageId: s('wa_msg_id del mensaje original'), a: s('wid destino') } },
  },
  {
    name: 'agregar_pendiente',
    description: 'Agrega un pendiente. dueno=usuario|maria, disparador=manual|respuesta_usuario|trigger_externo. Para trigger_externo esperando respuesta de un tercero, sumá meta.esperando_de + meta.esperando_canal.',
    inputSchema: { type: 'object', additionalProperties: true, required: ['desc', 'dueno', 'disparador'],
      properties: { desc: s('descripción'), dueno: s('usuario|maria', { enum: ['usuario', 'maria'] }),
        disparador: s('manual|respuesta_usuario|trigger_externo', { enum: ['manual', 'respuesta_usuario', 'trigger_externo'] }),
        meta: { type: 'object', additionalProperties: true } } },
  },
  { name: 'quitar_pendiente', description: 'Cierra/quita un pendiente por id.',
    inputSchema: { type: 'object', additionalProperties: true, required: ['id'], properties: { id: { type: 'integer' } } } },
  { name: 'posponer_pendiente', description: 'Pospone un pendiente (dueno=usuario) hasta una fecha ISO o offset "+3h"/"+1d".',
    inputSchema: { type: 'object', additionalProperties: true, required: ['id', 'hasta'], properties: { id: { type: 'integer' }, hasta: s('ISO o +Nh/+Nd') } } },
  {
    name: 'programar_mensaje',
    description: 'Programa un mensaje para el futuro. canal=whatsapp|gmail. destino = wid o email. cuando = ISO 8601.',
    inputSchema: { type: 'object', additionalProperties: true, required: ['cuando', 'canal', 'destino', 'texto'],
      properties: { cuando: s('ISO 8601'), canal: s('whatsapp|gmail', { enum: ['whatsapp', 'gmail'] }), destino: s('wid o email'), texto: s('mensaje'), asunto: s('si canal=gmail') } },
  },
  { name: 'cancelar_programado', description: 'Cancela un mensaje programado por id.',
    inputSchema: { type: 'object', additionalProperties: true, required: ['id'], properties: { id: { type: 'integer' } } } },
  {
    name: 'crear_follow_up',
    description: 'Recordatorio interno: si <esperando_de> no responde en N días, avisar al usuario. Se cierra solo si responde antes.',
    inputSchema: { type: 'object', additionalProperties: true, required: ['descripcion', 'esperando_de', 'vence_en_dias'],
      properties: { descripcion: s(''), esperando_de: s('wid o email'), esperando_canal: s('whatsapp|gmail'), vence_en_dias: { type: 'integer' }, metadata: { type: 'object', additionalProperties: true } } },
  },
  { name: 'cerrar_follow_up', description: 'Cierra manualmente un follow-up abierto por id.',
    inputSchema: { type: 'object', additionalProperties: true, required: ['id'], properties: { id: { type: 'integer' } } } },
  { name: 'recordar_hecho', description: 'Guarda un hecho/preferencia del usuario (memoria curada). clave en snake_case.',
    inputSchema: { type: 'object', additionalProperties: true, required: ['clave', 'valor'], properties: { clave: s('snake_case'), valor: s(''), fuente: s('opcional') } } },
  { name: 'olvidar_hecho', description: 'Borra un hecho guardado por clave.',
    inputSchema: { type: 'object', additionalProperties: true, required: ['clave'], properties: { clave: s('') } } },
  {
    name: 'upsert_contacto',
    description: 'Crea o actualiza un contacto en la libreta del usuario. Para poder mandarle WA después, incluí whatsapp.',
    inputSchema: { type: 'object', additionalProperties: true, required: ['nombre'],
      properties: { nombre: s(''), whatsapp: s('wid, ej 5491...@c.us'), email: s(''), notas: s(''), cumple: s('YYYY-MM-DD o --MM-DD') } },
  },
  { name: 'cambiar_visibilidad_contacto', description: 'Cambia visibilidad de un contacto (privada|publica). Identificá por contactoId | nombre | whatsapp | email.',
    inputSchema: { type: 'object', additionalProperties: true, required: ['visibilidad'], properties: { visibilidad: s('privada|publica', { enum: ['privada', 'publica'] }), contactoId: { type: 'integer' }, nombre: s(''), whatsapp: s(''), email: s('') }, forzar_nuevo: { type: 'boolean', description: 'true SOLO si el usuario confirmó que es OTRA persona distinta de un contacto parecido existente' } } },
  { name: 'set_cumple_contacto', description: 'Fija el cumpleaños de un contacto. cumple = YYYY-MM-DD o --MM-DD.',
    inputSchema: { type: 'object', additionalProperties: true, required: ['cumple'], properties: { cumple: s(''), contactoId: { type: 'integer' }, nombre: s(''), whatsapp: s(''), email: s('') } } },
  {
    name: 'crear_usuario',
    description: 'SOLO OWNER. Da de alta un usuario nuevo. Si no pasás wa_cus pero el owner ya lo tiene en la libreta, se hereda. Sin WhatsApp no recibe brief/recordatorios.',
    inputSchema: { type: 'object', additionalProperties: true, required: ['nombre'],
      properties: { nombre: s(''), wa_cus: s('wid, ej 5491...@c.us'), wa_lid: s('opcional'), email: s(''), calendar_id: s(''), tz: s(''), brief_hora: s('HH'), brief_minuto: s('MM'), ubicacion: s('Ciudad, PAIS') } },
  },
  { name: 'actualizar_usuario', description: 'SOLO OWNER. Actualiza campos parciales de un usuario por id.',
    inputSchema: { type: 'object', additionalProperties: true, required: ['id'], properties: { id: { type: 'integer' }, nombre: s(''), wa_cus: s(''), email: s(''), calendar_id: s(''), tz: s(''), brief_hora: s(''), brief_minuto: s(''), ubicacion: s(''), idioma: s('es|en') } } },
  { name: 'borrar_usuario', description: 'SOLO OWNER. Desactiva (soft delete) un usuario por id. No se puede borrar al owner.',
    inputSchema: { type: 'object', additionalProperties: true, required: ['id'], properties: { id: { type: 'integer' } } } },
  {
    name: 'set_calendar_acceso',
    description: 'Setea el nivel de acceso de Maria al calendar de un usuario. modo=none|read|write|autodetect (autodetect chequea el accessRole real y guarda el valor).',
    inputSchema: { type: 'object', additionalProperties: true, required: ['usuarioId'],
      properties: { usuarioId: { type: 'integer' }, modo: s('none|read|write|autodetect', { enum: ['none', 'read', 'write', 'autodetect'] }) } },
  },
  { name: 'buscar_contacto_global', description: 'SOLO OWNER. Busca en la libreta de TODOS los usuarios (cross-usuario). Pasá al menos nombre|whatsapp|email.',
    inputSchema: { type: 'object', additionalProperties: true, properties: { nombre: s(''), whatsapp: s(''), email: s('') } } },
  { name: 'buscar_slots_comunes', description: 'Cruza calendars de varios usuarios y devuelve slots libres comunes. usuarios = lista de NOMBRES (como figuran en tu contexto), NO ids.',
    inputSchema: { type: 'object', additionalProperties: true, required: ['usuarios'], properties: {
      usuarios: { type: 'array', items: { type: 'string' }, description: 'nombres de los usuarios a cruzar' },
      duracion_min: { type: 'integer', description: 'duración del slot en minutos (default 60)' },
      ventana_dias: { type: 'integer', description: 'cuántos días hacia adelante buscar (default 7)' },
      hora_desde: { type: 'integer', description: 'hora mínima del día, ej 9 (default 9)' },
      hora_hasta: { type: 'integer', description: 'hora máxima del día, ej 19 (default 19)' } } } },
  { name: 'confirmar_prospecto_pendiente', description: 'SOLO OWNER. Confirma la creación de un prospecto detectado. canal=whatsapp|gmail + remitente_id.',
    inputSchema: { type: 'object', additionalProperties: true, required: ['canal', 'remitente_id'], properties: { canal: s('whatsapp|gmail'), remitente_id: s(''), nombre: s(''), wa_cus: s(''), email: s(''), calendar_id: s('') } } },
  { name: 'rechazar_prospecto_pendiente', description: 'SOLO OWNER. Descarta un prospecto pendiente. canal + remitente_id.',
    inputSchema: { type: 'object', additionalProperties: true, required: ['canal', 'remitente_id'], properties: { canal: s('whatsapp|gmail'), remitente_id: s('') } } },
  { name: 'vincular_telegram', description: 'Da las instrucciones para que el usuario que escribe vincule su Telegram (canal de respaldo): link al bot + botón Compartir mi número (un tap), con código de 6 dígitos como alternativa si su Telegram usa otro número. Usala cuando pida vincular/conectar Telegram. Respondele con las `instrucciones` del resultado.',
    inputSchema: { type: 'object', additionalProperties: true, properties: {} } },
  { name: 'configurar_brief', description: 'Activa/pausa el brief matutino del usuario que escribe (self-service).',
    inputSchema: { type: 'object', additionalProperties: true, properties: { activo: { type: 'boolean' } } } },
  { name: 'configurar_ubicacion', description: 'Fija la ciudad del usuario que escribe (para el clima del brief). Cambia también su zona horaria.',
    inputSchema: { type: 'object', additionalProperties: true, required: ['ubicacion'], properties: { ubicacion: s('Ciudad, PAIS') } } },
  { name: 'configurar_caldav', description: 'Onboarding CalDAV (iCloud/Yahoo/Fastmail). server_url + username + password (app password). Default: el usuario que escribe; usuario_id solo si el owner configura a otro.',
    inputSchema: { type: 'object', additionalProperties: true, required: ['server_url', 'username', 'password'], properties: { server_url: s(''), username: s(''), password: s(''), usuario_id: { type: 'integer', description: 'id del usuario destino (solo owner; default el que escribe)' } } } },
  { name: 'iniciar_microsoft_auth', description: 'Paso 1 onboarding Microsoft/Outlook: genera la URL PKCE para que el user autorice. Default: el usuario que escribe; usuario_id solo si el owner lo inicia para otro.',
    inputSchema: { type: 'object', additionalProperties: true, properties: { usuario_id: { type: 'integer', description: 'id del usuario destino (solo owner; default el que escribe)' } } } },
  { name: 'configurar_microsoft', description: 'Paso 2 onboarding Microsoft: intercambia el authorization code por tokens. Necesita code.',
    inputSchema: { type: 'object', additionalProperties: true, required: ['code'], properties: { code: s('authorization code del browser') } } },
];

module.exports = { TOOLS };
