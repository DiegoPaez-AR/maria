// whatsapp-handler.js — handler unificado de mensajes de WhatsApp (multi-user)
//
// Pipeline canal-agnóstico. Cada mensaje entrante:
//   0) resolver quién es el remitente vía usuarios.resolverPorWa(msg.from).
//      - si es un usuario registrado → pipeline normal con ctx.usuario = él.
//      - si es desconocido → delegamos a unknown-flow (pide a quién va, matchea,
//        y cuando matchea re-entra a esta misma pipeline como si el mensaje le
//        hubiera llegado directo al usuario destinatario).
//   1) si es vcard → upsertContacto (libreta del usuario)
//   2) si es audio → transcribir con whisper
//   3) log al memory (usuario_id=usuario.id, canal='whatsapp', dir='entrante')
//   4) construir prompt con contexto del usuario
//   5) invocar Claude → { respuesta, acciones, razonamiento }
//   6) enviar respuesta por WA + log saliente
//   7) ejecutar acciones con ctx = { usuario, waClient, canalOrigen }

const { Client, LocalAuth } = require('whatsapp-web.js');
const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode-terminal');

const mem = require('./memory');
const turnState = require('./turn-state');
// MARIA_MCP_ACTIONS retirado 2026-07-03: las acciones van SIEMPRE por tools MCP.
const usuarios = require('./usuarios');
const unknownFlow = require('./unknown-flow');
const seguridad = require('./seguridad');
const moderacion = require('./moderacion');
const { transcribirAudio } = require('./transcribir');
const { construirPrompt, construirTurnoSesion } = require('./prompt-builder');
const { invocarClaudeJSON, invocarClaudeJSONConConsultas } = require('./claude-client');
const sesiones = require('./session-manager');
// (ejecutarAcciones ya no se importa: el array legacy no se ejecuta más acá)
const waSend = require('./wa-send');

const CHROME_BIN = process.env.CHROME_BIN || '/usr/bin/google-chrome';

// Si el proceso anterior murió sucio (OOM, SIGKILL, kernel panic), Chrome
// deja un SingletonLock en su userDataDir y el próximo arranque puede
// quedarse colgado al adquirirlo. Lo borramos antes de instanciar el Client.
function _limpiarSingletonLockViejo() {
  const dataPath = process.env.WA_AUTH_DIR;
  if (!dataPath) return; // default cwd-relative — dejamos que wweb maneje
  const candidatos = [
    path.join(dataPath, 'session', 'SingletonLock'),
    path.join(dataPath, 'session', 'SingletonCookie'),
    path.join(dataPath, 'session', 'SingletonSocket'),
  ];
  for (const f of candidatos) {
    try {
      fs.unlinkSync(f);
      console.log(`[WA boot] borré lock viejo: ${f}`);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.warn(`[WA boot] no pude borrar ${f}: ${err.message}`);
      }
    }
  }
}

// ── Catch-up post-reconexión (pedido Diego 2026-07-05) ─────────────────────
// Al reconectar, buscar los mensajes que llegaron mientras WA estuvo caído y
// procesarlos desde el último entrante registrado. Dedupe contra la DB (el Map
// en memoria no sobrevive restarts): un mensaje ya logueado NO se reprocesa.
// Caps: ventana máx 72h, 60 mensajes, solo chats 1a1 (grupos fuera).
async function recuperarMensajesPerdidos(client) {
  const MAX_H = Number(process.env.WA_CATCHUP_MAX_H || 72);
  const MAX_MSGS = Number(process.env.WA_CATCHUP_MAX_MSGS || 60);
  try {
    const row = mem.db.prepare(`SELECT MAX(timestamp) ts FROM eventos WHERE canal='whatsapp' AND direccion='entrante'`).get();
    if (!row || !row.ts) return;
    const ultimoMs = new Date(String(row.ts).replace(' ', 'T') + 'Z').getTime();
    const corteMs = Math.max(ultimoMs, Date.now() - MAX_H * 3600e3);
    if (Date.now() - corteMs < 3 * 60e3) { console.log('[WA catch-up] sin hueco significativo — nada que recuperar'); return; }
    console.log(`[WA catch-up] buscando entrantes desde ${new Date(corteMs).toISOString()}…`);
    const qYaVisto = mem.db.prepare(`
      SELECT 1 FROM eventos WHERE canal='whatsapp' AND direccion='entrante'
        AND timestamp >= datetime(?, '-2 hours')
        AND metadata_json LIKE '%' || ? || '%' LIMIT 1`);
    const chats = await client.getChats();
    const candidatos = [];
    for (const chat of chats) {
      try {
        if (chat.isGroup) continue;
        const lastTs = ((chat.lastMessage && chat.lastMessage.timestamp) || 0) * 1000;
        if (lastTs <= corteMs) continue;
        const msgs = await chat.fetchMessages({ limit: 30 });
        for (const m of msgs) {
          if (m.fromMe) continue;
          if (m.timestamp * 1000 <= corteMs) continue;
          const mid = m.id && m.id._serialized;
          if (mid && qYaVisto.get(new Date(corteMs).toISOString().replace('T', ' ').slice(0, 19), `"messageId":"${mid}"`)) continue;
          candidatos.push(m);
        }
      } catch (e) { console.warn(`[WA catch-up] chat falló:`, e.message); }
    }
    candidatos.sort((a, b) => a.timestamp - b.timestamp);
    const lote = candidatos.slice(0, MAX_MSGS);
    if (!lote.length) { console.log('[WA catch-up] 0 mensajes nuevos sin procesar'); return; }
    console.log(`[WA catch-up] ${candidatos.length} candidatos → proceso ${lote.length} (viejo→nuevo)`);
    mem.log({ canal: 'sistema', direccion: 'interno',
      cuerpo: `WA catch-up: recuperando ${lote.length} mensaje(s) llegados durante la caída`,
      metadata: { tipo: 'wa_catchup', total: lote.length } });
    for (const m of lote) {
      try { await handleMessage(client, m); }
      catch (e) { console.error('[WA catch-up] procesando msg:', e.message); }
      await new Promise(r => setTimeout(r, 2000)); // secuencial, sin ráfaga
    }
    console.log('[WA catch-up] terminado');
  } catch (err) {
    console.error('[WA catch-up] falló:', err.message);
  }
}

function crearClienteWA({ onReady, waEstado = null } = {}) {
  _limpiarSingletonLockViejo();

  const client = new Client({
    authStrategy: new LocalAuth({
      // En multi-instance, cada Maria tiene su propio directorio de auth de WA.
      // Default: cwd-relative '.wwebjs_auth/' (el que usa whatsapp-web.js si
      // no recibe nada). Podés overridear con WA_AUTH_DIR para apuntar a un
      // path absoluto (ej: state/<slug>/.wwebjs_auth).
      dataPath: process.env.WA_AUTH_DIR || undefined,
    }),
    // webVersionCache DESHABILITADO — causaba crashes cuando WA Web actualizaba su protocolo.
    puppeteer: {
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
        // Salida por IP argentina (2026-07-05, teoría del mismatch de IP):
        // si WA_PROXY está seteado (ej. socks5://127.0.0.1:1080 = túnel SSH
        // inverso desde la Mac de Diego), SOLO el Chromium de WhatsApp sale
        // por ahí. El resto de Maria sigue por la IP del VPS.
        ...(process.env.WA_PROXY ? [`--proxy-server=${process.env.WA_PROXY}`] : []),
      ],
      executablePath: CHROME_BIN,
    },
  });

  // Embudo global de envíos (ver wa-send.js): min WA_EMBUDO_MS entre mensajes.
  require('./wa-send').aplicarEmbudo(client);

  // ─── Eventos de ciclo de vida ──────────────────────────────────────────
  // Alerta por email al owner cuando WA está caído (disconnected / mucho
  // tiempo sin autenticar). Rate-limit por proceso: max 1 alerta por hora,
  // así un loop de crash no spamea. Idempotente entre restarts: usamos
  // estado_usuario.wa_alert_last_ts para no duplicar.
  const ASISTENTE_NOMBRE = process.env.ASISTENTE_NOMBRE || 'Maria';
  const _alertaWA = async (motivo, opts = {}) => {
    try {
      const owner = usuarios.obtenerOwner();
      if (!owner?.email) return; // sin email del owner no hay a quién avisar
      const ahora = Date.now();
      const lastTs = mem.getEstadoUsuario(owner.id, 'wa_alert_last_ts') || 0;
      // Cooldown 2h SIN bypass (pedido Diego 2026-07-05: el `forzar` del QR-loop
      // spameaba un mail por cada ciclo de restart durante los incidentes).
      const _COOLDOWN = Number(process.env.WA_ALERTA_COOLDOWN_MS || 2 * 60 * 60 * 1000);
      if (ahora - lastTs < _COOLDOWN) return;
      const g = require('./google');
      await g.enviarEmail({
        to: owner.email,
        asunto: `⚠️ ${ASISTENTE_NOMBRE}: WhatsApp desconectado`,
        texto: `Hola ${owner.nombre},\n\n${ASISTENTE_NOMBRE} perdió la sesión de WhatsApp Web (${motivo}). Para volver a conectar:\n\n1) ssh root@<vps> y correr: pm2 logs ${process.env.ASISTENTE_SLUG || 'maria-paez'} --lines 60\n2) Cuando aparezca un QR, escaneá desde tu celular en WhatsApp → Dispositivos vinculados → Vincular dispositivo.\n\nMientras tanto no recibís ni respondés mensajes por WhatsApp.\n\n--\n${ASISTENTE_NOMBRE}`,
      });
      mem.setEstadoUsuario(owner.id, 'wa_alert_last_ts', ahora);
      console.log(`[WA alert] email enviado a ${owner.email} (motivo: ${motivo})`);
    } catch (err) {
      console.warn(`[WA alert] no pude mandar mail al owner: ${err.message}`);
    }
  };

  // ─── Watchdog de boot (dos niveles) ─────────────────────────────────
  // 1) Mail al owner a los 3 min sin 'ready' (puede ser sesión válida que
  //    está tardando en cargar — informamos, no matamos).
  // 2) Si a los 10 min sigue sin 'ready', salimos: pm2 reintenta. Esto
  //    cubre el caso "Chromium colgado" / "boot trabado" donde el restart
  //    puede destrabar. NO resuelve "sesión expirada" — para eso está la
  //    detección de QR loop más abajo.
  const BOOT_ALERT_MS   = Number(process.env.WA_BOOT_ALERT_MS   || 3  * 60 * 1000);
  const BOOT_SUICIDE_MS = Number(process.env.WA_BOOT_SUICIDE_MS || 10 * 60 * 1000);
  let _readyTimeout = setTimeout(() => {
    _alertaWA('no logró autenticarse en 3 min desde el boot');
  }, BOOT_ALERT_MS);
  let _suicideTimeout = setTimeout(() => {
    // Reintentos espaciados (pedido Diego 2026-07-05): sin ready en 10min →
    // anotar reposo de 30min (wa-retry-after) y salir. El próximo boot ve el
    // marker, corre los loops SIN tocar WhatsApp (cero señales a Meta), y
    // recién al vencer el reposo reinicia para UN nuevo intento. Ciclo neto:
    // intento 10min → reposo 30min → intento…
    try {
      const RETRY_MS = Number(process.env.WA_RETRY_COOLDOWN_MS || 30 * 60 * 1000);
      const _stateDir = path.dirname(path.dirname(process.env.MARIA_DB || './db/x'));
      fs.writeFileSync(path.join(_stateDir, 'wa-retry-after'), String(Date.now() + RETRY_MS));
    } catch (e) { console.warn('[WA boot] no pude escribir wa-retry-after:', e.message); }
    console.error(`[WA boot] sin ready en ${BOOT_SUICIDE_MS/60000}min — reposo de conexión y exit (reintento en ~30min)`);
    mem.log({
      canal: 'sistema', direccion: 'interno',
      cuerpo: `WA boot timeout ${BOOT_SUICIDE_MS/60000}min sin ready — reposo 30min antes del próximo intento`,
    });
    setTimeout(() => process.exit(1), 500);
  }, BOOT_SUICIDE_MS);

  // ─── Detección de "sesión muerta" vs "boot lento" ───────────────────
  // whatsapp-web.js dispara 'qr' cada ~20s mientras no hay sesión válida.
  // Si vemos ≥3 QRs en 2 min al inicio → la sesión cacheada está muerta y
  // restartear no la va a resolver, hace falta que un humano escanee.
  // Mandamos alerta forzada (bypass cooldown) que diga eso explícitamente.
  const QR_LOOP_WINDOW_MS = Number(process.env.WA_QR_LOOP_WINDOW_MS || 2 * 60 * 1000);
  const QR_LOOP_THRESHOLD = Number(process.env.WA_QR_LOOP_THRESHOLD || 3);
  const _qrTimestamps = [];
  let _qrLoopAlertado = false;

  let _qrCount = 0;
  client.on('qr', (qr) => {
    _qrCount++;
    // En modo degradado el QR rota cada ~20s por horas/días: imprimir TODOS
    // inunda logs y snapshots (2026-07-05). Imprimimos 1 de cada 5 (~2-4 min);
    // para escanear alcanza con esperar el próximo completo.
    if (waEstado && waEstado.degradado && _qrCount % 5 !== 1) {
      if (_qrCount % 5 === 2) console.log('[WA qr] rotando en silencio (modo degradado) — próximo QR completo en ~2-4 min');
    } else {
      console.log('[WA qr] escaneá este QR:');
      qrcode.generate(qr, { small: true });
    }
    const ahora = Date.now();
    _qrTimestamps.push(ahora);
    while (_qrTimestamps.length && ahora - _qrTimestamps[0] > QR_LOOP_WINDOW_MS) {
      _qrTimestamps.shift();
    }
    if (_qrTimestamps.length >= QR_LOOP_THRESHOLD && !_qrLoopAlertado) {
      _qrLoopAlertado = true;
      console.error(`[WA] sesión expirada — ${_qrTimestamps.length} QRs en ${QR_LOOP_WINDOW_MS/1000}s`);
      mem.log({
        canal: 'sistema', direccion: 'interno',
        cuerpo: `WA sesión expirada — ${_qrTimestamps.length} QRs en ${QR_LOOP_WINDOW_MS/1000}s, requiere scan manual`,
      });
      _alertaWA(
        `sesión EXPIRADA — ${_qrTimestamps.length} QRs en ${Math.round(QR_LOOP_WINDOW_MS/1000)}s. ` +
        `Restartear NO sirve, hace falta scan manual del QR. Corré: ` +
        `pm2 logs ${process.env.ASISTENTE_SLUG || 'maria-paez'} --lines 60 ` +
        `y escaneá desde WhatsApp → Dispositivos vinculados.`,
        { forzar: true }
      );
    }
  });
  client.on('loading_screen', (pct, msg) => console.log(`[WA loading] ${pct}% - ${msg}`));
  client.on('authenticated',  ()   => {
    console.log('[WA authenticated]');
    _qrTimestamps.length = 0;
    _qrLoopAlertado = false;
  });
  client.on('auth_failure',   (m)  => {
    console.error('[WA auth_failure]', m);
    _alertaWA(`auth_failure: ${m}`);
  });
  client.on('change_state',   (s)  => console.log('[WA change_state]', s));
  client.on('disconnected',   (r)  => {
    console.error('[WA disconnected]', r);
    mem.log({
      canal: 'sistema', direccion: 'interno',
      cuerpo: `WA disconnected: ${r} — saliendo para que pm2 reinicie`,
    });
    _alertaWA(`disconnected: ${r}`);
    // Dejamos que pm2 levante el proceso — auto-recuperación.
    setTimeout(() => process.exit(1), 500);
  });
  // whatsapp-web.js re-emite 'ready' en cada reconexión / recarga del
  // contexto de la página de WA Web, no solo en el boot inicial. onReady
  // arranca TODOS los loops + internal-api.listen(), así que correrlo de
  // nuevo duplica loops (doble dispatch de programados, doble poll de
  // Gmail...) y revienta con EADDRINUSE en :4501. Guarda de idempotencia:
  // onReady corre una sola vez por proceso.
  let _onReadyYaCorrio = false;
  client.on('ready', () => {
    console.log('✅ [WA ready] Maria conectada');
    clearTimeout(_readyTimeout);
    clearTimeout(_suicideTimeout);
    if (_onReadyYaCorrio) {
      console.log('[WA ready] re-emitido (reconexión) — loops ya activos, no re-inicializo');
      return;
    }
    _onReadyYaCorrio = true;
    if (typeof onReady === 'function') onReady(client);
  });

  // ─── Watchdog: detectar frame detached y suicidarnos ───────────────────
  // whatsapp-web.js no siempre dispara 'disconnected' cuando el iframe de
  // WA Web se muere. Vigilamos cualquier llamada que falle con
  // "detached Frame" / "Target closed" y forzamos exit — pm2 levanta.
  function _esFrameMuerto(err) {
    const m = String(err?.message || err || '');
    return /detached Frame|Target closed|Session closed|Execution context was destroyed|Protocol error.*\b(Runtime|Page)\b/i.test(m);
  }
  let _suicidandose = false;
  function _suicidarSiFrameMuerto(err, origen) {
    if (!_esFrameMuerto(err) || _suicidandose) return false;
    _suicidandose = true;
    console.error(`[WA watchdog] frame muerto detectado en ${origen} — saliendo:`, err.message);
    mem.log({
      canal: 'sistema', direccion: 'interno',
      cuerpo: `WA frame muerto (${origen}): ${err.message} — pm2 reinicia`,
    });
    setTimeout(() => process.exit(1), 500);
    return true;
  }
  client._watchdogFrameMuerto = _suicidarSiFrameMuerto;

  // ─── Mensajes entrantes ─────────────────────────────────────────────────
  client.on('message', async (msg) => {
    try {
      await handleMessage(client, msg);
    } catch (err) {
      console.error('[WA handler] error no manejado:', err);
      mem.log({
        canal: 'sistema', direccion: 'interno',
        cuerpo: `WA handler crasheó: ${err.message}`,
        metadata: { stack: err.stack, from: msg.from },
      });
    }
  });

  return client;
}

// ─── Procesamiento de un mensaje (pre-proceso + debouncing) ─────────────
//
// Cuando un user manda dos mensajes seguidos (ej: la imagen y después "es
// este"), WA Web los entrega como dos eventos en el mismo segundo. Si los
// procesamos por separado, María responde dos veces — una sin contexto y
// otra con. Para evitarlo, encolamos los mensajes por chat (`from`) y
// esperamos `WA_DEBOUNCE_MS` (default 5s) antes de despacharlos. Cualquier
// mensaje del mismo chat que llegue dentro de ese rato se suma al grupo.
// Cuando el timer expira, llamamos al LLM UNA sola vez con el cuerpo
// combinado y los adjuntos acumulados.

const _DEBOUNCE_MS = Number(process.env.WA_DEBOUNCE_MS || 10000);
const _colas         = new Map(); // from → { items, timer }
const _enProceso     = new Map(); // from → true mientras se está despachando
const _colaPendiente = new Map(); // from → items[] acumulados durante un despacho en curso
const _lastIncoming  = new Map(); // from → ts (Date.now()) del último mensaje entrante — usado para abortar respuestas obsoletas si entró algo nuevo durante el procesamiento

// Acciones con efecto externo que el usuario "ve" → si fallan, hay que avisarle
// en vez de confirmar. Compartida entre el camino legacy (array) y el MCP (tools).
const ACCIONES_VISIBLES = new Set([
  'enviar_wa', 'reenviar_wa', 'enviar_email', 'responder_email',
  'programar_mensaje', 'cancelar_programado',
  'crear_evento', 'modificar_evento', 'borrar_evento',
]);
const _procesadosMsg = new Map(); // message-id → ts, dedupe de entregas repetidas (redelivery tras reconexión)
const _DEDUPE_TTL_MS = 10 * 60 * 1000; // 10 min: ventana de retención de ids ya procesados

// Cache lid -> @c.us telefonico. El @lid puede rotar entre sesiones de WA;
// dentro de una sesion es estable, asi que cachear evita pegarle a
// getContactLidAndPhone en cada mensaje del mismo contacto.
const _cacheLidCus = new Map();

// Resuelve el @c.us telefonico ESTABLE de un remitente que llego como @lid.
// El @lid rota; el numero de telefono no. Cascada de fuentes, de mas a
// menos confiable:
//   1) client.getContactLidAndPhone([lid]) -- API oficial de whatsapp-web.js
//      (lid -> phone number). Feature-detected: si la version de la lib no
//      la expone, se saltea sin romper.
//   2) contact.id._serialized -- si msg.getContact() ya lo resolvio a @c.us.
//   3) contact.number -- numero del Contact, ultimo recurso.
// Devuelve "<digitos>@c.us" o null. Nunca tira (degradacion silenciosa: el
// caller deja el @lid, igual que el comportamiento previo).
async function _resolverCusEstable(client, lid, contact) {
  if (_cacheLidCus.has(lid)) return _cacheLidCus.get(lid);
  let cus = null;
  try {
    if (client && typeof client.getContactLidAndPhone === 'function') {
      const pares = await client.getContactLidAndPhone([lid]);
      const pn = Array.isArray(pares) && pares[0] && pares[0].pn;
      const dig = String(pn || '').replace(/\D/g, '');
      if (dig.length >= 8) cus = `${dig}@c.us`;
    }
  } catch (e) {
    console.warn(`[WA lid-resolve] getContactLidAndPhone fallo (${lid}): ${e.message}`);
  }
  if (!cus) {
    const cid = contact && contact.id && contact.id._serialized;
    if (cid && cid.endsWith('@c.us')) cus = cid;
  }
  if (!cus) {
    const dig = String((contact && contact.number) || '').replace(/\D/g, '');
    if (dig.length >= 8) cus = `${dig}@c.us`;
  }
  console.log(`[WA lid-resolve] ${lid} -> ${cus || '(no resuelto, queda @lid)'}`);
  if (cus) _cacheLidCus.set(lid, cus);
  return cus;
}

// Cuando una o más acciones VISIBLES fallan, Maria redacta ella misma el aviso
// para el usuario — segundo turno acotado del LLM. El error crudo del executor
// se le pasa SOLO al modelo (para eso está escrito); jamás va literal al user.
// Devuelve el texto del aviso, o un fallback genérico y seguro si el turno falla.
async function _componerAvisoFallas(usuario, textoQueLeDijo, fallasVisibles) {
  const nombreAsis = process.env.ASISTENTE_NOMBRE || 'su secretaria';
  const detalle = fallasVisibles.map(r => {
    const a = r.accion || {};
    const target = a.a || a.to || a.destino || a.summary || a.id || '';
    return `- ${a.tipo}${target ? ` (${String(target).slice(0, 80)})` : ''}: ${r.error}`;
  }).join('\n');
  const prompt = [
    `Sos ${nombreAsis}, secretaria personal de ${usuario.nombre}. Hablás en primera persona, como una persona real. NUNCA mencionás "sistema", "acción", "bot" ni nombres técnicos (crear_evento, enviar_wa, forzar, etc.).`,
    ``,
    `Ibas a decirle esto a ${usuario.nombre} por WhatsApp (OJO: todavía NO se lo enviaste — este aviso REEMPLAZA ese mensaje, así que tiene que ser coherente leído solo):`,
    `<<<`,
    String(textoQueLeDijo || '(no ibas a decirle nada en particular)').slice(0, 1200),
    `>>>`,
    ``,
    `Pero una o más de las cosas que ibas a hacer NO se concretaron. Detalle TÉCNICO — es solo para que entiendas vos qué pasó; NO lo copies literal ni uses su vocabulario:`,
    detalle,
    ``,
    `Redactá UN mensaje breve y natural para ${usuario.nombre} (es el ÚNICO que va a recibir) avisándole con honestidad qué pudiste hacer y qué no, y por qué, en tu voz. NO confirmes como hecho nada que figure como fallado arriba. Si el detalle indica que se puede reintentar con su confirmación (por ejemplo: un evento que se superpone con otro y se podría agendar igual encima), ofrecele esa opción en lenguaje natural. Si no hay nada que el usuario pueda decidir, simplemente avisale con claridad. Nada de jerga ni nombres técnicos.`,
    ``,
    `Respondé SOLO con JSON válido, sin markdown: {"aviso": "el texto del mensaje"}`,
  ].join('\n');
  try {
    const { json } = await invocarClaudeJSON(prompt);
    const aviso = json && typeof json.aviso === 'string' ? json.aviso.trim() : '';
    if (aviso) return aviso;
    console.warn('[WA aviso-fallas] el segundo turno no devolvió un aviso usable');
  } catch (err) {
    console.error('[WA aviso-fallas] segundo turno falló:', err.message);
  }
  return `Disculpá ${usuario.nombre}, una de las cosas que te dije que iba a hacer no me salió. ¿Me la recordás así la reintento?`;
}

async function handleMessage(client, msg) {
  if (msg.fromMe) return;

  // Resolver pushname, contact, messageId temprano.
  let pushname = null;
  let contact = null;
  try {
    contact = await msg.getContact();
    pushname = contact?.pushname || contact?.name || null;
  } catch {}
  const messageId = msg.id?._serialized || msg.id?.id || null;

  // ─── Dedupe por message-id (evita reprocesar la MISMA entrega) ────────
  // WhatsApp Web re-emite 'message' para mensajes ya vistos tras una
  // reconexión/reboot (mismo id._serialized). Sin este guard, Maria vuelve
  // a correr el turno completo (doble claude_call, doble acción). Chequeo
  // SINCRÓNICO acá arriba (antes de cualquier await) para blindar la
  // re-entrancy entre dos eventos del mismo id. OJO: esto NO cubre reenvíos
  // del usuario (texto repetido con id NUEVO) — eso es tema de latencia.
  if (messageId) {
    const _now = Date.now();
    if (_procesadosMsg.has(messageId)) {
      console.log(`[WA dedupe] ${messageId} ya procesado — salteo`);
      return;
    }
    _procesadosMsg.set(messageId, _now);
    if (_procesadosMsg.size > 3000) {
      for (const [k, t] of _procesadosMsg) if (_now - t > _DEDUPE_TTL_MS) _procesadosMsg.delete(k);
    }
  }

  // Normalizar `from` al @c.us estable (número telefónico). El @lid rota
  // entre sesiones; el @c.us es invariante mientras dure el número. Trabajar
  // internamente con @c.us hace que historial, libreta, prompt y debounce
  // vean UN solo hilo por contacto aunque WA rote el LID. El @lid original
  // queda como `fromLid` para fallback de envío (whatsapp-web.js a veces
  // solo entrega al @lid del entrante cuando el destino no está en la
  // libreta del teléfono de Maria).
  let from = msg.from;
  let fromLid = null;
  if (from && from.endsWith('@lid')) {
    fromLid = from;
    const cusEstable = await _resolverCusEstable(client, from, contact);
    if (cusEstable) from = cusEstable;
  }

  // Marcar el chat como leído inmediatamente (best-effort). Antes Maria
  // dejaba todos los mensajes con doble check gris hasta responder, lo
  // que con el debouncing de 10s era visible para el remitente como
  // 'no leído' por más tiempo.
  try {
    const chat = await msg.getChat();
    if (chat && typeof chat.sendSeen === 'function') await chat.sendSeen();
  } catch {}

  // Caso especial: vCard → libreta del usuario que la manda. Va directo,
  // sin debouncing — es metadata, no parte del flujo conversacional.
  if (msg.type === 'vcard') {
    const usuario = usuarios.resolverPorWa(from);
    if (!usuario) {
      // Antes: return silencioso -> el vCard desaparecía sin rastro (fue el
      // caso Gabi pre-binding). Ahora lo logueamos para que sea diagnosticable
      // en vez de perderse: si un usuario servido no resuelve, esto lo delata.
      console.warn(`[WA vcard] remitente no resuelto (${from}) - vCard NO guardado`);
      mem.log({ canal: 'sistema', direccion: 'interno',
        cuerpo: `vCard de remitente no resuelto (${from}) - no se guardó (usuario no reconocido)`,
        metadata: { tipo: 'vcard_no_resuelto', from, fromLid } });
      return;
    }
    return await _manejarVCard(client, msg, usuario);
  }

  // Pre-procesar: extraer texto / transcribir audio / descargar media.
  // Esto se hace ANTES del debouncing para que cuando el timer expire ya
  // tengamos todo listo (los attachments en /tmp, los audios transcriptos).
  const item = await _preProcesarMensaje(client, msg, { pushname, contact, messageId, from, fromLid });
  if (!item) return; // sticker / vacío / fallo de transcripción

  // ─── Rate limit por usuario / global ─────────────────────────────────
  const _usrTmp = usuarios.resolverPorWa(from);
  // Guard MCP (fase 2): registrar el ts del último entrante por CHAT (2026-07-02,
  // antes por usuario), para que /accion pueda abortar acciones de un turno que
  // quedó obsoleto. Se registra para TODO chat (usuarios y terceros): un tercero
  // que reescribe también invalida su turno en curso — semántica del abort legacy.
  turnState.setLastInbound('whatsapp:' + from, Date.now());
  const rl = seguridad.verificarRateLimit({ usuarioId: _usrTmp?.id || null });
  if (!rl.ok) {
    console.warn(`[WA rate-limit] ${from} bloqueado: ${rl.motivo}`);
    mem.logSecurityEvent({
      usuarioId: _usrTmp?.id || null,
      canal: 'whatsapp',
      motivo: `rate_limit ${rl.motivo}`,
      body: (item.cuerpo || '').slice(0, 200),
      extra: { retry_in_ms: rl.retry_in_ms, from, fromLid },
    });
    try {
      await client.sendMessage(from, `⏳ vas muy rápido — esperá ${Math.ceil(rl.retry_in_ms / 1000)}s y volvé a probar`);
    } catch {}
    return;
  }

  // ─── Detección de prompt injection ───────────────────────────────────
  const motivoInj = seguridad.detectarInjection(item.cuerpo);
  if (motivoInj) {
    console.warn(`[WA injection] ${from} → ${motivoInj}: ${(item.cuerpo || '').slice(0, 120)}`);
    mem.logSecurityEvent({
      usuarioId: _usrTmp?.id || null,
      canal: 'whatsapp',
      motivo: `injection_attempt: ${motivoInj}`,
      body: item.cuerpo,
      extra: { from, fromLid, pushname },
    });
    // Mail al owner por CADA intento (decisión de Diego, sin cooldown).
    // Si esto genera ruido se le puede agregar cooldown más adelante.
    _mailOwnerInjection({ canal: 'whatsapp', motivo: motivoInj, body: item.cuerpo, from, pushname, usuarioId: _usrTmp?.id || null });
    // NO bloqueamos — el LLM va a rechazarlo via Capa 2.
  }

  // ─── Moderación de contenido ENTRANTE (best-effort, no bloquea) ───────
  // Pre-filtro de keywords adentro de revisarEntrante: solo clasifica los
  // sospechosos. Fire-and-forget para no sumar latencia al pipeline. Si da
  // positivo: log + aviso al owner. Que Maria no actúe sobre eso lo cubre la
  // regla #7 del prompt.
  moderacion.revisarEntrante(item.cuerpo).then((rm) => {
    if (rm && rm.bloquear) {
      mem.logSecurityEvent({
        usuarioId: _usrTmp?.id || null, canal: 'whatsapp',
        motivo: `contenido_entrante (${rm.categoria}/${rm.severidad}): ${rm.motivo || ''}`,
        body: item.cuerpo,
        extra: { from, pushname, tipo_mod: 'entrante_flag', categoria: rm.categoria, severidad: rm.severidad },
      });
      _avisoOwnerContenidoInbound({ canal: 'whatsapp', categoria: rm.categoria, severidad: rm.severidad, motivo: rm.motivo, remitente: pushname ? `${pushname} (${from})` : from });
    }
  }).catch(() => {});

  _encolar(client, from, item);
}

async function _preProcesarMensaje(client, msg, { pushname, contact, messageId, from, fromLid }) {
  let cuerpo = (msg.body || '').trim();
  let esAudio = false;
  let mediaMeta = null;
  let attachmentPath = null;

  // Audio → transcribir con whisper.
  if (msg.type === 'ptt' || msg.type === 'audio') {
    try {
      const media = await msg.downloadMedia();
      if (!media) {
        console.warn('[WA] audio sin media');
        await client.sendMessage(from, '(no pude descargar el audio, mandame texto)');
        return null;
      }
      console.log('[WA] transcribiendo audio…');
      cuerpo = await transcribirAudio(media);
      esAudio = true;
      console.log(`[WA audio→texto] ${cuerpo.slice(0, 160)}`);
    } catch (err) {
      console.error('[WA] transcripción falló:', err.message);
      mem.log({
        canal: 'sistema', direccion: 'interno',
        cuerpo: `transcripción WA falló: ${err.message}`,
        metadata: { from, fromLid, messageId },
      });
      await client.sendMessage(from, '(no pude transcribir tu audio — mandamelo en texto)');
      return null;
    }
  }

  // Media (imagen / video / documento / etc). Lo procesamos AUNQUE haya
  // texto (caption + media en un solo evento es válido), excepto stickers
  // y audios (que ya pasaron arriba).
  if (msg.hasMedia && msg.type !== 'sticker' && msg.type !== 'ptt' && msg.type !== 'audio') {
    const filename = msg._data?.filename || null;
    const mime     = msg._data?.mimetype || msg.type || 'archivo';
    const sizeKb   = msg._data?.size ? Math.round(msg._data.size / 1024) : null;
    mediaMeta = { filename, mime, sizeKb };
    if (!cuerpo) {
      cuerpo = `(adjuntó ${filename || mime}${sizeKb ? `, ${sizeKb} KB` : ''})`;
    }

    // Visión multimodal: imágenes y PDFs los bajamos a /tmp para que
    // Claude Code los lea con su tool Read vía @path.
    const esImagenOPdf = /^image\//i.test(mime) || /^application\/pdf$/i.test(mime);
    const MAX_BYTES = 20 * 1024 * 1024;
    if (esImagenOPdf && msg._data?.size && msg._data.size <= MAX_BYTES) {
      try {
        const media = await msg.downloadMedia();
        if (media?.data) {
          let ext = '';
          if (filename && /\.[a-z0-9]+$/i.test(filename)) {
            ext = filename.match(/\.[a-z0-9]+$/i)[0];
          } else if (/^image\/jpe?g$/i.test(mime)) ext = '.jpg';
          else if (/^image\/png$/i.test(mime))    ext = '.png';
          else if (/^image\/webp$/i.test(mime))   ext = '.webp';
          else if (/^image\/gif$/i.test(mime))    ext = '.gif';
          else if (/^application\/pdf$/i.test(mime)) ext = '.pdf';
          else ext = '.bin';
          const safeId = (messageId || `wa-${Date.now()}`).replace(/[^A-Za-z0-9_.-]/g, '_');
          const tmpPath = path.join('/tmp', `maria-attach-${safeId}${ext}`);
          fs.writeFileSync(tmpPath, Buffer.from(media.data, 'base64'));
          attachmentPath = tmpPath;
          console.log(`[WA] media → ${tmpPath} (${sizeKb} KB)`);
        }
      } catch (err) {
        console.warn(`[WA] no pude descargar media de ${messageId}: ${err.message}`);
      }
    }
  }

  if (!cuerpo) return null; // nada que procesar

  return { cuerpo, esAudio, mediaMeta, attachmentPath, messageId, pushname, contact, fromLid, msg };
}

function _encolar(client, from, item) {
  // Trackear timestamp del último mensaje entrante por chat. Usado para
  // abortar el envío de respuestas que quedan obsoletas porque entró un
  // mensaje nuevo durante el procesamiento.
  _lastIncoming.set(from, Date.now());

  // Si ya estamos despachando un grupo para este `from`, encolamos al
  // "siguiente lote" para evitar que María responda dos veces cuando el
  // user manda un mensaje nuevo mientras la primera respuesta todavía se
  // está cocinando (LLM + envío). Cuando el dispatch en curso termina, el
  // pendiente se re-encola (con su debounce de 10s) y se procesa como un
  // grupo nuevo — incluyendo otros mensajes que caigan en esa ventana.
  if (_enProceso.get(from)) {
    const pend = _colaPendiente.get(from) || [];
    pend.push(item);
    _colaPendiente.set(from, pend);
    return;
  }

  let q = _colas.get(from);
  if (!q) {
    q = { items: [], timer: null };
    _colas.set(from, q);
  }
  q.items.push(item);
  if (q.timer) clearTimeout(q.timer);
  q.timer = setTimeout(() => _disparar(client, from), _DEBOUNCE_MS);
}

async function _disparar(client, from) {
  const q = _colas.get(from);
  if (!q) return;
  const items = q.items;
  _colas.delete(from);

  _enProceso.set(from, true);
  // Snapshot del ts del último entrante. Si llega un mensaje nuevo
  // durante el procesamiento, _hayMsgNuevoDesdeStart() lo detecta
  // y aborta los sendMessage de respuesta Y las acciones del turno —
  // los items se re-encolan y el próximo lote (que ya incluye los
  // mensajes nuevos) re-genera respuesta y acciones coherentes.
  // Ver fix 2026-05-17 abort send + fix 2026-06-09 outFlags/acciones.
  const startTs = _lastIncoming.get(from) || Date.now();
  const outFlags = {};
  try {
    await _despacharGrupo(client, from, items, startTs, outFlags);
  } catch (err) {
    console.error(`[WA debounce] error despachando grupo de ${from}:`, err);
  } finally {
    _enProceso.delete(from);
    let pend = _colaPendiente.get(from) || [];
    // Si el lote actual se abortó (entró msg nuevo, no se mandó la respuesta),
    // re-encolar sus items al INICIO del próximo lote para que Maria los
    // retome junto con los nuevos. Limpiamos attachmentPath: el archivo /tmp
    // ya fue consumido/borrado y el cuerpo (texto/transcripción) ya está en
    // el item.
    if (outFlags.abortado && items.length) {
      const itemsAbortados = items.map(i => ({ ...i, attachmentPath: null }));
      pend = [...itemsAbortados, ...pend];
      console.log(`[WA debounce] thread abortado de ${from} — re-encolando ${itemsAbortados.length} item(s) con ${pend.length - itemsAbortados.length} pendientes`);
    }
    if (pend.length) {
      _colaPendiente.delete(from);
      for (const item of pend) _encolar(client, from, item);
    }
  }
}

async function _despacharGrupo(client, from, items, startTs, outFlags = {}) {
  if (!items.length) return;
  const principal = items[0];
  const cuerpoCombinado  = items.map(i => i.cuerpo).filter(Boolean).join('\n');
  const attachmentPaths  = items.flatMap(i => i.attachmentPath ? [i.attachmentPath] : []);
  const algunMedia       = items.some(i => i.mediaMeta);
  const algunAudio       = items.some(i => i.esAudio);
  const messageId        = principal.messageId;
  const pushname         = principal.pushname;
  const contact          = principal.contact;
  const msgOriginal      = principal.msg;

  let usuario = usuarios.resolverPorWa(from);

  // Usuario inactivo (suscripción pausada / cancelada) → responder UNA vez con
  // link al portal y no procesar más. Track del último aviso en estado_usuario.
  if (usuario && usuario.activo === 0) {
    const ULTIMO_AVISO_KEY = 'aviso_inactivo_ts';
    const ultimoAviso = mem.getEstadoUsuario(usuario.id, ULTIMO_AVISO_KEY);
    const ahora = Date.now();
    const HORAS_REPETIR = 24 * 60 * 60_000; // re-avisar máximo cada 24h
    if (!ultimoAviso || (ahora - new Date(ultimoAviso).getTime()) > HORAS_REPETIR) {
      try {
        await client.sendMessage(from, `Hola ${usuario.nombre}, tu suscripción está pausada. Para reactivarla, entrá a https://intensa.io/maria/cuenta/ y actualizá tu medio de pago.`);
        mem.log({
          usuarioId: usuario.id, canal: 'whatsapp', direccion: 'saliente',
          para: from, cuerpo: '(aviso inactivo enviado)',
          metadata: { tipo: 'inactivo_aviso' },
        });
        mem.setEstadoUsuario(usuario.id, ULTIMO_AVISO_KEY, new Date(ahora).toISOString());
      } catch (e) { console.warn('[wa-handler/inactivo] error enviando aviso:', e.message); }
    }
    mem.log({
      usuarioId: usuario.id, canal: 'whatsapp', direccion: 'entrante',
      de: from, nombre: pushname, cuerpo: cuerpoCombinado,
      metadata: { tipo: 'inactivo_ignorado', messageId },
    });
    console.log(`[wa-handler] usuario ${usuario.nombre} inactivo — entrante registrado, sin procesar`);
    return;
  }

  if (!usuario) {
    // Desconocido → unknown-flow. Pasamos el cuerpo combinado y, en el
    // reprocesar (cuando matchee a un user), propagamos los attachments.
    // mediaInfo: si el batch tiene algún item con media, exponer su
    // messageId para que cuando unknown-flow re-loggee el evento al
    // destinatario, el historial cross-canal incluya `[wa_msg_id=...]` y
    // el LLM pueda emitir reenviar_wa. Sin esto, los mensajes con media
    // que llegan via unknown-flow (típico: dispositivo vinculado @lid)
    // pierden la info de media en el log y no se pueden reenviar.
    const itemConMedia = items.find(it => it.mediaMeta);
    const mediaInfo = itemConMedia ? {
      esMedia: true,
      mediaMessageId: itemConMedia.messageId,
      ...itemConMedia.mediaMeta,
    } : null;
    try {
      await unknownFlow.handleWA({
        client,
        from,
        fromLid: principal.fromLid,
        msg: msgOriginal,
        contact,
        cuerpo: cuerpoCombinado,
        mediaInfo,
        reprocesarComoUsuario: async (usuarioDestino, entrada) => {
          await _procesarComoUsuario({
            client,
            usuario: usuarioDestino,
            entrada: {
              ...entrada,
              ...(attachmentPaths.length ? { attachmentPaths } : {}),
            },
            msgOriginal,
            startTs,
            from,
            outFlags,
          });
        },
      });
    } finally {
      for (const p of attachmentPaths) { try { fs.unlinkSync(p); } catch {} }
    }
    return;
  }

  // Captura del @lid del user la primera vez que escribe.
  if (from && from.endsWith('@lid') && usuario.wa_lid !== from) {
    usuarios.setWaLid(usuario.id, from);
    usuario = usuarios.obtener(usuario.id);
    console.log(`[WA] capturado @lid de ${usuario.nombre}: ${from}`);
    mem.log({
      usuarioId: usuario.id,
      canal: 'sistema', direccion: 'interno',
      cuerpo: `LID de ${usuario.nombre} actualizado: ${from}`,
    });
  }

  const nombre = usuario.nombre || pushname || from;
  const tagAgrupado = items.length > 1 ? ` [${items.length} msgs agrupados]` : '';
  console.log(`[WA ←] ${nombre} (${from})${algunAudio ? ' 🎤' : ''}${tagAgrupado}: ${cuerpoCombinado.slice(0, 160)}`);

  // Cada item se loguea individualmente para preservar historial granular.
  for (const it of items) {
    mem.log({
      usuarioId: usuario.id,
      canal: 'whatsapp', direccion: 'entrante',
      de: from, nombre, cuerpo: it.cuerpo,
      tipo_original: it.msg.type,
      metadata: {
        messageId: it.messageId, esAudio: it.esAudio, pushname,
        ...(it.fromLid ? { fromLid: it.fromLid } : {}),
        ...(it.mediaMeta ? { esMedia: true, ...it.mediaMeta } : {}),
        ...(it.attachmentPath ? { attachmentPath: it.attachmentPath } : {}),
      },
    });
  }

  try {
    await _procesarComoUsuario({
      client,
      usuario,
      entrada: {
        de: from,
        nombre,
        cuerpo: cuerpoCombinado,
        esAudio: algunAudio,
        messageId,
        ...(algunMedia ? { esMedia: true } : {}),
        ...(attachmentPaths.length ? { attachmentPaths } : {}),
      },
      msgOriginal,
      startTs,
      from,
      outFlags,
    });
  } finally {
    for (const p of attachmentPaths) { try { fs.unlinkSync(p); } catch {} }
  }
}

/**
 * Pipeline post-resolución de usuario: prompt → Claude → respuesta →
 * acciones. Se invoca tanto para mensajes de usuarios conocidos como para
 * mensajes reencaminados desde unknown-flow.
 */
async function _procesarComoUsuario({ client, usuario, entrada, msgOriginal, startTs = null, from = null, outFlags = {} }) {
  const prompt = await construirPrompt({
    usuario,
    canal: 'whatsapp',
    entrada,
  });

  let respUsr = '';
  let respRem = '';
  let acciones = [];
  let razonamiento = null;
  const _chatKeyTurno = (from || entrada.de) ? ('whatsapp:' + (from || entrada.de)) : null;
  // ¿El turno lo inició el propio usuario o un tercero? (hoisted 2026-07-02
  // para el gate de exfiltración del executor y el audit MCP)
  const _esTurnoDeUsuario = !!entrada.de
    && usuarios.resolverPorWa(entrada.de)?.id === usuario.id;
  try {
    // ─── Sesiones persistentes (MARIA_SESIONES=1, default APAGADO) ───────
    // Con sesión viva, resumimos la conversación de la CLI (--resume): el
    // historial queda cacheado en la API y solo pagamos el delta del turno.
    // Requiere prompt split {system,user} (con MARIA_SYSTEM_SPLIT=0 no hay
    // system separado que hashear ni cachear → flujo clásico).
    // Turnos de TERCEROS van SIEMPRE sessionless (incidente 2026-06-11):
    // meter el mensaje de un tercero en la sesión del usuario mezcla
    // interlocutores en una historia lineal y Maria pierde el hilo de con
    // quién habla. El tercero corre con prompt completo; su intercambio
    // entra a la sesión del usuario vía [NOVEDADES] en el próximo turno.
    // resolverPorWa banca @lid/@c.us/9-movil — la comparacion literal de ayer
    // daba false para el propio usuario (sesion:"off" siempre, bug 2026-06-12).
    const SESIONES_ON = process.env.MARIA_SESIONES === '1'
      && prompt && typeof prompt === 'object' && !!prompt.system
      && _esTurnoDeUsuario;
    const auditWA = { usuarioId: usuario.id, canal: 'whatsapp', chatKey: _chatKeyTurno, turnStartTs: startTs, turnoTercero: !_esTurnoDeUsuario };
    let json;
    if (!SESIONES_ON) {
      ({ json } = await invocarClaudeJSONConConsultas(prompt, { usuario }, { audit: auditWA, sesion: 'off' }));
    } else {
      // Mutex por usuario: dos turnos concurrentes no pueden resumir la
      // misma sesión en paralelo (forkearían la historia).
      json = await sesiones.lockUsuario(usuario.id, async () => {
        const hash = sesiones.promptHashDe(prompt.system);
        let ses = sesiones.getSesion(usuario.id);
        if (ses && sesiones.debeRotar(ses, hash)) {
          console.log(`[WA sesion/${usuario.nombre}] rotando sesión (turnos=${ses.turnos}, creada=${ses.creada})`);
          sesiones.resetSesion(usuario.id);
          ses = null;
        }
        // Turno inicial: prompt completo como siempre; la sesión nueva queda
        // con reglas + contexto en su historia para los turnos siguientes.
        const turnoInicial = async () => {
          const r = await invocarClaudeJSONConConsultas(prompt, { usuario }, { audit: auditWA, sesion: 'nueva', sesionTurno: 1 });
          if (r.sessionId) {
            sesiones.guardarSesion(usuario.id, { id: r.sessionId, turnos: 1, creada: new Date().toISOString(), promptHash: hash });
          }
          return r.json;
        };
        if (!ses) return await turnoInicial();
        // Turno resumido: user-message compacto, las reglas ya viven en la sesión.
        const turno = await construirTurnoSesion({ usuario, canal: 'whatsapp', entrada });
        try {
          const r = await invocarClaudeJSONConConsultas(turno, { usuario }, {
            audit: auditWA, resumeId: ses.id, sesion: 'resume', sesionTurno: ses.turnos + 1,
          });
          // Cada --resume devuelve un session_id nuevo — persistimos ese.
          sesiones.guardarSesion(usuario.id, { ...ses, id: r.sessionId || ses.id, turnos: ses.turnos + 1 });
          return r.json;
        } catch (err) {
          if (err.codigo !== 'RESUME_FALLIDO') throw err;
          // La sesión murió (expiró, se borró, exit raro): rotamos y caemos
          // UNA vez al turno inicial completo. Sin reintentos del resume.
          console.warn(`[WA sesion/${usuario.nombre}] resume falló (${err.message}) — roto sesión y reintento con prompt completo`);
          sesiones.resetSesion(usuario.id);
          return await turnoInicial();
        }
      });
    }
    respUsr      = (json.respuesta_a_usuario   || '').toString();
    respRem      = (json.respuesta_a_remitente || '').toString();
    // Compat: si solo viene `respuesta` legacy, en WA se trata como
    // respuesta al usuario atendido (mantiene comportamiento previo).
    if (!respUsr && !respRem && json.respuesta) {
      respUsr = json.respuesta.toString();
    }
    acciones     = Array.isArray(json.acciones) ? json.acciones : [];
    razonamiento = json.razonamiento || null;
  } catch (err) {
    console.error(`[WA/${usuario.nombre}] Claude falló:`, err.message);
    mem.log({
      usuarioId: usuario.id,
      canal: 'sistema', direccion: 'interno',
      cuerpo: `Claude falló en WA (${usuario.nombre}): ${err.message}`,
      metadata: { from: entrada.de, messageId: entrada.messageId },
    });
    // Para timeouts (consulta se colgó), avisar al user — quedó esperando una
    // respuesta que no va a llegar y los próximos mensajes podrían encolarse
    // mal. Para otros errores transitorios mantenemos silencio (el usuario
    // prefiere silencio a ruido, y el próximo mensaje suele re-procesar bien).
    const esTimeout = /Timeout global|Idle timeout/.test(err.message);
    if (esTimeout && entrada.de) {
      try {
        await waSend.enviarWADirecto(
          client,
          entrada.de,
          'Se me colgó procesando lo último que me mandaste — la consulta tardó demasiado y se canceló. Si querés repetilo, mejor cortado en pedazos más chicos.',
        );
      } catch (e2) {
        console.warn(`[WA/${usuario.nombre}] no pude avisar timeout:`, e2.message);
      }
    }
    return;
  }

  // Destinos:
  //   destinoUsuario   = wa del usuario atendido
  //   destinoRemitente = wa de quien escribió este mensaje (puede ser el
  //                      usuario en flujo normal, o un tercero si vino
  //                      reprocesado desde unknown-flow).
  const destinoUsuario   = usuario.wa_lid || usuario.wa_cus || null;
  const destinoRemitente = entrada.de || destinoUsuario;
  const remitenteEsUsuario =
    !!destinoUsuario && !!entrada.de &&
    (entrada.de === usuario.wa_lid || entrada.de === usuario.wa_cus);

  // Helper: chequea si llegó mensaje nuevo del mismo `from` durante el
  // procesamiento. Si sí, abortar este envío — el próximo lote (que ya
  // incluirá los mensajes nuevos) va a generar una respuesta coherente.
  // Las acciones del turno también se saltean (NO son idempotentes:
  // crear_evento/enviar_wa/enviar_email duplicarían al re-procesar).
  function _hayMsgNuevoDesdeStart() {
    if (!startTs || !from) return false;
    const last = _lastIncoming.get(from);
    return !!(last && last > startTs);
  }

  // ── Commit atómico: ACCIONES primero, después UN mensaje al usuario ──────
  // Si llegó un mensaje nuevo mientras generábamos esta respuesta, abortamos
  // TODO (sends + acciones): el próximo lote (que ya incluye el msg nuevo)
  // regenera una respuesta coherente. Las acciones NO son idempotentes
  // (enviar_wa/crear_evento duplicarían al re-procesar), por eso van junto al
  // send, en un solo punto.
  if (_hayMsgNuevoDesdeStart()) {
    outFlags.abortado = true;
    turnState.takeTurnResults(_chatKeyTurno, startTs); // descarte: que no los herede otro turno
    console.log(`[WA →usr] ABORTADO ${usuario.nombre} (${destinoUsuario}): llegó msg nuevo durante procesamiento — el próximo lote responde${acciones.length ? ` (${acciones.length} acción/es salteadas)` : ''}`);
  } else {
    // 1) Acciones PRIMERO: sabemos qué se concretó ANTES de confirmarle al
    //    usuario. Evita el "ya les escribo" seguido de "no pude escribirles".
    let fallasVisibles = [];
    if (acciones.length) {
      // Telemetría del trial: en modo MCP las acciones van por tools. Si el
      // modelo igual emitió el array, es un MISS de adopción — lo registramos
      // (no lo ejecutamos: las que sí quiso hacer ya corrieron en vivo por tool).
      console.warn(`[WA/${usuario.nombre}] MCP: modelo emitió ${acciones.length} acción(es) en array en vez de tools — NO ejecutadas`);
      try { mem.log({ usuarioId: usuario.id, canal: 'sistema', direccion: 'interno',
        cuerpo: `mcp_fallback: modelo emitió ${acciones.length} acción(es) en array en modo MCP (no ejecutadas): ${acciones.map(a => a && a.tipo).filter(Boolean).join(', ')}`,
        metadata: { tipo: 'mcp_fallback', acciones } }); } catch {}
    }
    // Backstops deterministas del camino MCP (2026-07-02): las acciones ya
    // corrieron en vivo vía /accion; acá tomamos sus resultados y aplicamos
    // lo mismo que legacy aplica post-ejecución — aviso honesto en vez de
    // confirmación optimista + cancelar trigger_externo huérfanos (Kona/Evelia).
    if (_chatKeyTurno && startTs) {
      const _resTurno = turnState.takeTurnResults(_chatKeyTurno, startTs);
      if (_resTurno.length) {
        const okMcp = _resTurno.filter(r => r.ok).length;
        console.log(`[WA acciones-mcp/${usuario.nombre}] ${okMcp}/${_resTurno.length} ejecutadas en vivo`);
        fallasVisibles = _resTurno.filter(r => !r.ok && !r.stale && ACCIONES_VISIBLES.has(r.accion?.tipo));
        if (fallasVisibles.length) {
          console.warn(`[WA acciones-mcp/${usuario.nombre}] FALLARON visibles: ` +
            fallasVisibles.map(r => `${r.accion?.tipo || '?'}: ${r.error}`).join(' | '));
          for (const r of _resTurno) {
            if (r.ok && r.accion?.tipo === 'agregar_pendiente'
                && r.accion?.disparador === 'trigger_externo' && r.resultado?.id) {
              try {
                mem.quitarPendiente(usuario.id, r.resultado.id);
                if (r.resultado.follow_up?.id) mem.setFollowUpEstado(r.resultado.follow_up.id, 'cancelado');
                console.log(`[WA backstop-mcp] cancelé pendiente trigger_externo #${r.resultado.id} (un envío del turno falló)`);
              } catch (e) { console.warn('[WA backstop-mcp] cancelar pendiente falló:', e.message); }
            }
          }
        }
      }
    }
    // (bloque de ejecución legacy del array `acciones` eliminado 2026-07-03 —
    //  las acciones corren en vivo por tools; sus backstops viven arriba.)

    // 2) Mensaje al usuario atendido. Si una acción visible falló, mandamos el
    //    aviso honesto (redactado por Maria) EN LUGAR de la confirmación
    //    optimista — un solo mensaje, sin contradicción. Si no, la respuesta
    //    normal del LLM.
    if (destinoUsuario && (respUsr.trim() || fallasVisibles.length)) {
      let textoUsr = respUsr;
      let slot = 'respuesta_a_usuario';
      if (fallasVisibles.length) {
        textoUsr = await _componerAvisoFallas(usuario, respUsr, fallasVisibles);
        slot = 'respuesta_con_fallos';
      }
      if (textoUsr && textoUsr.trim()) {
        try {
          await client.sendMessage(destinoUsuario, textoUsr);
          mem.log({
            usuarioId: usuario.id,
            canal: 'whatsapp', direccion: 'saliente',
            de: destinoUsuario, nombre: usuario.nombre, cuerpo: textoUsr,
            metadata: { razonamiento, inReplyTo: entrada.messageId, slot, ...(fallasVisibles.length ? { fallas: fallasVisibles.length } : {}) },
          });
          console.log(`[WA →usr] ${usuario.nombre} (${destinoUsuario})${fallasVisibles.length ? ' [con fallos]' : ''}: ${textoUsr.slice(0, 160)}`);
        } catch (err) {
          console.error('[WA] enviar respuesta_a_usuario falló:', err.message);
          if (client._watchdogFrameMuerto) client._watchdogFrameMuerto(err, 'sendMessage respuesta_a_usuario');
        }
      }
    }

    // 3) Mandar al remitente tercero (si hay texto, hay destino, y NO es el
    //    mismo chat que el usuario — evitamos doble mensaje en flujo normal).
    if (respRem.trim() && destinoRemitente && !remitenteEsUsuario) {
      // Moderación del slot (2026-07-02, review 0701): texto libre del modelo
      // hacia un TERCERO — era el único saliente que esquivaba la capa de
      // moderación (iba por sendMessage directo). Mismo criterio fail-open
      // que _moderarSaliente del executor.
      let _modBloquea = false;
      try {
        const _rm = await moderacion.revisarSaliente(respRem);
        if (_rm.bloquear) {
          _modBloquea = true;
          console.warn(`[WA →3ro] respuesta_a_remitente BLOQUEADA por moderación (${_rm.categoria}/${_rm.severidad})`);
          try { mem.logSecurityEvent({ usuarioId: usuario.id, canal: 'whatsapp',
            motivo: `respuesta_a_remitente bloqueada (${_rm.categoria}/${_rm.severidad}): ${_rm.motivo || ''}`,
            body: respRem, extra: { tipo_mod: 'saliente_bloqueado', destino: destinoRemitente } }); } catch {}
        }
      } catch (e) { console.warn('[WA →3ro] moderación falló (fail-open):', e.message); }
      if (!_modBloquea) try {
        await client.sendMessage(destinoRemitente, respRem);
        mem.log({
          usuarioId: usuario.id,
          canal: 'whatsapp', direccion: 'saliente',
          de: destinoRemitente, nombre: entrada.nombre, cuerpo: respRem,
          metadata: { razonamiento, inReplyTo: entrada.messageId, slot: 'respuesta_a_remitente', tercero: true },
        });
        console.log(`[WA →3ro] ${usuario.nombre}/${entrada.nombre || destinoRemitente}: ${respRem.slice(0, 160)}`);
      } catch (err) {
        console.error('[WA] enviar respuesta_a_remitente falló:', err.message);
        if (client._watchdogFrameMuerto) client._watchdogFrameMuerto(err, 'sendMessage respuesta_a_remitente');
      }
    } else if (respRem.trim() && remitenteEsUsuario && !respUsr.trim() && !fallasVisibles.length) {
      // Edge: el LLM puso el texto en respuesta_a_remitente en vez de
      // respuesta_a_usuario y el remitente es el propio usuario. (Si hubo
      // fallos, en (2) ya le mandamos el aviso al usuario — no duplicamos.)
      try {
        await client.sendMessage(destinoUsuario, respRem);
        mem.log({
          usuarioId: usuario.id,
          canal: 'whatsapp', direccion: 'saliente',
          de: destinoUsuario, nombre: usuario.nombre, cuerpo: respRem,
          metadata: { razonamiento, inReplyTo: entrada.messageId, slot: 'respuesta_a_remitente_redirected_to_usuario' },
        });
        console.log(`[WA →usr] ${usuario.nombre} (${destinoUsuario}) [via respuesta_a_remitente]: ${respRem.slice(0, 160)}`);
      } catch (err) {
        console.error('[WA] enviar respuesta (redirect) falló:', err.message);
        if (client._watchdogFrameMuerto) client._watchdogFrameMuerto(err, 'sendMessage redirect');
      }
    }
  }
}

// ─── vCard ─────────────────────────────────────────────────────────────
//
// Política de visibilidad: TODO vCard nuevo se guarda PRIVADO por default.
// Maria responde diciendo qué guardó y deja la puerta abierta para que el
// usuario diga "ponelo público" — el LLM lo levanta vía la acción
// cambiar_visibilidad_contacto. Para que el LLM tenga contexto de "qué pasarlo
// a público" cuando el usuario dice "sí" o "público", guardamos el id del
// último vcard agregado en estado_usuario.ultimo_vcard.

// Parsea BDAY de un body vCard. Soporta:
//   BDAY:19850315          → 1985-03-15
//   BDAY:1985-03-15        → 1985-03-15
//   BDAY:1985-03-15T00:00Z → 1985-03-15
//   BDAY:--0315            → --03-15  (vCard 4.0 sin año)
//   BDAY:--03-15           → --03-15
// Devuelve string o null.
function _parsearBDAY(body) {
  const m = body.match(/^BDAY[^:]*:(.+)$/m);
  if (!m) return null;
  const raw = m[1].trim();
  // Sin año: --MMDD o --MM-DD
  let mm = raw.match(/^--(\d{2})-?(\d{2})$/);
  if (mm) return `--${mm[1]}-${mm[2]}`;
  // Con año: YYYYMMDD o YYYY-MM-DD (con o sin time suffix)
  mm = raw.match(/^(\d{4})-?(\d{2})-?(\d{2})/);
  if (mm) return `${mm[1]}-${mm[2]}-${mm[3]}`;
  return null;
}

async function _manejarVCard(client, msg, usuario) {
  const nombreMatch = msg.body.match(/FN:(.+)/);
  const telMatch    = msg.body.match(/TEL[^:]*:(.+)/);
  if (!nombreMatch || !telMatch) return;

  const nombre = nombreMatch[1].trim();
  const numero = telMatch[1].trim().replace(/\D/g, '');
  if (!nombre || !numero) return;
  const waId = numero.endsWith('@c.us') ? numero : `${numero}@c.us`;
  const cumple = _parsearBDAY(msg.body);

  // Default: privado del usuario que mandó el vCard.
  let contacto;
  try {
    contacto = mem.upsertContacto({
      usuarioId: usuario.id,
      nombre, whatsapp: waId, cumple,
      visibilidad: 'privada',
    });
  } catch (err) {
    console.error(`[WA vcard/${usuario.nombre}] error guardando ${nombre}:`, err.message);
    await client.sendMessage(msg.from, `❌ no pude guardar el contacto de ${nombre}: ${err.message}`);
    return;
  }

  mem.log({
    usuarioId: usuario.id,
    canal: 'sistema', direccion: 'interno',
    cuerpo: `contacto vcard (privado): ${nombre} → ${waId}${cumple ? ` (cumple ${cumple})` : ''}`,
    metadata: { origen: msg.from, contactoId: contacto?.id, cumple },
  });
  console.log(`📒 [WA vcard/${usuario.nombre}] ${nombre} → ${waId}${cumple ? ` cumple=${cumple}` : ''} (privado)`);

  // Persistir contexto para que el LLM sepa qué contacto es "lo" si el
  // usuario responde "sí, hacelo público" en el próximo mensaje. TTL 10min.
  mem.setEstadoUsuario(usuario.id, 'ultimo_vcard', {
    contactoId: contacto?.id,
    nombre,
    whatsapp: waId,
    cumple,
    ts: Date.now(),
  });

  let aviso = `📒 Te lo guardé en tu libreta privada: *${nombre}*`;
  if (cumple) aviso += ` (cumple ${cumple})`;
  aviso += `.\n¿Lo paso a la libreta pública?`;
  await client.sendMessage(msg.from, aviso);
}


// Manda mail al owner por cada intento de injection detectado. Sin cooldown
// (decisión: queremos enterarnos de cada intento; si molesta ajustamos).
async function _mailOwnerInjection({ canal, motivo, body, from, pushname, usuarioId }) {
  try {
    const owner = usuarios.obtenerOwner();
    if (!owner?.email) return;
    const g = require('./google');
    const ASISTENTE_NOMBRE = process.env.ASISTENTE_NOMBRE || 'Maria';
    const remitente = pushname ? `${pushname} (${from})` : from;
    const usrLabel = usuarioId ? `usuario_id=${usuarioId}` : 'desconocido';
    await g.enviarEmail({
      to: owner.email,
      asunto: `🚨 ${ASISTENTE_NOMBRE}: prompt injection detectado (${motivo})`,
      texto: `Detecté un intento de prompt injection.\n\nCanal: ${canal}\nMotivo: ${motivo}\nRemitente: ${remitente}\n${usrLabel}\n\nMensaje literal:\n---\n${body || '(vacío)'}\n---\n\nMaria lo va a rechazar (Capa 2 del prompt). Este mail es para que sepas que pasó.\n\n--\n${ASISTENTE_NOMBRE}`,
    });
  } catch (err) {
    console.warn(`[WA injection mail] no pude mandar al owner: ${err.message}`);
  }
}

// Aviso al owner por contenido entrante inapropiado (throttled anti-flood).
const _ultimoAvisoInbound = { ts: 0 };
async function _avisoOwnerContenidoInbound({ canal, categoria, severidad, motivo, remitente }) {
  try {
    const owner = usuarios.obtenerOwner();
    if (!owner?.email) return;
    const ahora = Date.now();
    const THR = Number(process.env.MARIA_MOD_AVISO_THROTTLE_MS || 5 * 60 * 1000);
    if (ahora - _ultimoAvisoInbound.ts < THR) return;
    _ultimoAvisoInbound.ts = ahora;
    const g = require('./google');
    const ASISTENTE_NOMBRE = process.env.ASISTENTE_NOMBRE || 'Maria';
    await g.enviarEmail({
      to: owner.email,
      asunto: `⚠️ ${ASISTENTE_NOMBRE}: contenido inapropiado entrante (${categoria})`,
      texto: `Un tercero mandó contenido marcado como inapropiado.\n\nCanal: ${canal}\nCategoría: ${categoria} (${severidad})\nMotivo: ${motivo || '-'}\nRemitente: ${remitente}\n\nMaria no actúa sobre eso (regla #7). Aviso informativo.\n\n--\n${ASISTENTE_NOMBRE}`,
    });
  } catch (err) {
    console.warn(`[moderacion inbound mail] no pude avisar al owner: ${err.message}`);
  }
}

module.exports = { crearClienteWA, recuperarMensajesPerdidos, handleMessage };
