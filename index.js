// index.js — entry point unificado de Maria (multi-user)
//
// Un solo proceso que:
//   1) arranca el cliente de WhatsApp (whatsapp-handler.js)
//   2) cuando WA está listo, inicia el poll de Gmail + loops por usuario
//      (recordatorios, programados, morning-brief, meeting-prep)
//   3) todos comparten memory (SQLite, multi-user) y google.js
//
// Variables de entorno útiles:
//   OWNER_NOMBRE      → nombre del owner (default Diego) — solo para el
//                       bootstrap inicial si la DB está vacía
//   DIEGO_WA          → wa_cus del owner para bootstrap (default 541132317896@c.us)
//   DIEGO_EMAIL       → email del owner para bootstrap (default diego@paez.is)
//   OWNER_CALENDAR_ID → calendar id del owner (default = su email)
//   MARIA_TZ          → tz del owner para bootstrap
//   GMAIL_POLL_MS     → intervalo de poll de Gmail (default 300000)
//   CALENDAR_WATCH_MS → intervalo de re-chequeo de calendar_acceso (default 28800000 = 8h)
//   CHROME_BIN        → binary de Chrome (default /usr/bin/google-chrome)
//   MARIA_DB          → path de sqlite (default ./db/maria.sqlite)

const path = require('path');
const fs = require('fs');

const mem = require('./memory');
const usuarios = require('./usuarios');
const { verificarDependencias } = require('./transcribir');
const { crearClienteWA } = require('./whatsapp-handler');
const { iniciarPoll } = require('./gmail-handler');
const { iniciarRecordatorios } = require('./recordatorios');
const { iniciarProgramados } = require('./programados');
const { iniciarMorningBrief } = require('./morning-brief');
const { iniciarMeetingPrep } = require('./meeting-prep');
const loopGuard = require('./loop-guard');
const { iniciarCalendarWatch } = require('./calendar-watch');
const { iniciarFollowUps } = require('./follow-ups');
const internalApi = require('./internal-api');
const { iniciarMemoriaCurada } = require('./memoria-curada');
const { iniciarMariaWorker } = require('./maria-worker');
const { iniciarCumpleAvisos } = require('./cumple-avisos');
const { iniciarResumenSemanal } = require('./resumen-semanal');
const { iniciarPodaEventos } = require('./poda-eventos');
const { iniciarDiferidosDrainer } = require('./diferidos-drainer');
const { iniciarTelegram } = require('./telegram-handler');

const GMAIL_POLL_MS   = Number(process.env.GMAIL_POLL_MS   || 300_000);
const RECORDATORIO_MS = Number(process.env.RECORDATORIO_MS || 30 * 60_000);
const PROGRAMADOS_MS  = Number(process.env.PROGRAMADOS_MS  || 60_000);
const BRIEF_MS        = Number(process.env.BRIEF_MS        || 60_000);
const MEETING_PREP_MS = Number(process.env.MEETING_PREP_MS || 5 * 60_000);
const CALENDAR_WATCH_MS = Number(process.env.CALENDAR_WATCH_MS || 8 * 60 * 60_000);
const FOLLOW_UPS_MS   = Number(process.env.FOLLOW_UPS_MS   || 5 * 60_000);
const MEMORIA_CURADA_MS = Number(process.env.MEMORIA_CURADA_MS || 24 * 60 * 60_000);
const MARIA_WORKER_MS = Number(process.env.MARIA_WORKER_MS || 30 * 60_000);
const CUMPLE_AVISOS_MS = Number(process.env.CUMPLE_AVISOS_MS || 15 * 60_000);
const RESUMEN_SEMANAL_MS = Number(process.env.RESUMEN_SEMANAL_MS || 15 * 60_000);
const DIFERIDOS_MS    = Number(process.env.DIFERIDOS_MS    || 5 * 60_000);

let gmailInterval = null;
let recordatoriosInterval = null;
let programadosInterval = null;
let briefInterval = null;
let meetingPrepInterval = null;
let calendarWatchInterval = null;
let followUpsInterval = null;
let internalApiServer = null;
let memoriaCuradaInterval = null;
let mariaWorkerInterval = null;
let cumpleAvisosInterval = null;
let resumenSemanalInterval = null;
let podaEventosInterval = null;
let diferidosInterval = null;
let waClient = null;

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const _asistenteNombre = process.env.ASISTENTE_NOMBRE || process.env.MARIA_FROM_NAME || 'Maria Paez';
  const _asistenteSlug = process.env.ASISTENTE_SLUG ? ` [${process.env.ASISTENTE_SLUG}]` : '';
  console.log(`▸ ${_asistenteNombre}${_asistenteSlug} iniciando…`);

  // Usuarios (owner se bootstrapea automáticamente en memory.js)
  const owner = usuarios.obtenerOwner();
  const activos = usuarios.listarActivos();
  console.log(`  Owner:      ${owner ? `${owner.nombre} (id=${owner.id})` : '(no definido!)'}`);
  console.log(`  Usuarios:   ${activos.length} activo(s) → ${activos.map(u => u.nombre).join(', ')}`);
  console.log(`  Gmail poll: cada ${GMAIL_POLL_MS/1000}s`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // 1) Whisper
  const probs = verificarDependencias();
  if (probs.length) {
    console.warn('[warn] whisper no está 100%:');
    for (const p of probs) console.warn('  -', p);
    console.warn('  los audios no se van a poder transcribir hasta arreglarlo');
  } else {
    console.log('✓ whisper OK');
  }

  // 2) Migración oportunista de contactos.json → libreta del owner
  if (owner) {
    try {
      const n = mem.importarDesdeContactosJson(owner.id, path.join(__dirname, 'contactos.json'));
      if (n) console.log(`✓ importados ${n} contactos de contactos.json (owner=${owner.nombre})`);
    } catch (err) {
      console.warn('[warn] importando contactos.json:', err.message);
    }
  }

  // 3a) Telegram de respaldo — arranca ANTES de WhatsApp a propósito: si WA
  //     no llega a ready (sesión caída, QR pendiente), el respaldo tiene que
  //     estar vivo para avisar a los usuarios vinculados y atenderlos.
  const waEstado = { ready: false };
  iniciarTelegram({ waEstado });

  // ── Arranque de loops (extraído de onReady, 2026-07-05) ──────────────────
  // Idempotente: puede llamarse desde onReady (modo normal, client vivo) o
  // desde el MODO DEGRADADO (client=null: WA caído/en revisión — los envíos a
  // usuarios salen por el fallback TG→email de wa-send; las acciones enviar_wa
  // a terceros fallan honesto).
  let _loopsArrancados = false;
  let _modoDegradado = false;
  const arrancarLoops = (client) => {
    if (_loopsArrancados) return;
    _loopsArrancados = true;
    if (client) loopGuard.setWaClient(client);
            console.log(`▸ arrancando poll de Gmail (cada ${GMAIL_POLL_MS/1000}s)`);
      gmailInterval = iniciarPoll({ waClient: client, intervaloMs: GMAIL_POLL_MS });

      console.log(`▸ arrancando loop de recordatorios (cada ${RECORDATORIO_MS/60_000}min)`);
      recordatoriosInterval = iniciarRecordatorios({
        waClient: client, intervaloMs: RECORDATORIO_MS,
      });

      console.log(`▸ arrancando dispatcher de programados (cada ${PROGRAMADOS_MS/1000}s)`);
      programadosInterval = iniciarProgramados({
        waClient: client, intervaloMs: PROGRAMADOS_MS,
      });

      console.log('▸ arrancando morning-brief (por usuario, ventana 4h)');
      briefInterval = iniciarMorningBrief({
        waClient: client, intervaloMs: BRIEF_MS,
      });

      console.log(`▸ arrancando meeting-prep (cada ${MEETING_PREP_MS/60_000}min)`);
      meetingPrepInterval = iniciarMeetingPrep({
        intervaloMs: MEETING_PREP_MS,
      });

      console.log(`▸ arrancando calendar-watch (cada ${CALENDAR_WATCH_MS/3600_000}h)`);
      calendarWatchInterval = iniciarCalendarWatch({
        intervaloMs: CALENDAR_WATCH_MS,
      });

      console.log(`▸ arrancando follow-ups (cada ${FOLLOW_UPS_MS/60_000}min)`);
      followUpsInterval = iniciarFollowUps({
        waClient: client, intervaloMs: FOLLOW_UPS_MS,
      });

      console.log(`▸ arrancando memoria-curada (cada ${MEMORIA_CURADA_MS/3600_000}h)`);

      internalApiServer = internalApi.start({ waClient: client });

      memoriaCuradaInterval = iniciarMemoriaCurada({
        intervaloMs: MEMORIA_CURADA_MS,
      });

      console.log(`▸ arrancando maria-worker (cada ${MARIA_WORKER_MS/60_000}min, tareas dueno=maria)`);
      mariaWorkerInterval = iniciarMariaWorker({
        waClient: client, intervaloMs: MARIA_WORKER_MS,
      });

      console.log('▸ arrancando cumple-avisos (noche anterior, tz usuario)');
      cumpleAvisosInterval = iniciarCumpleAvisos({
        waClient: client, intervaloMs: CUMPLE_AVISOS_MS,
      });

      console.log('▸ arrancando resumen-semanal (domingos, tz usuario)');
      resumenSemanalInterval = iniciarResumenSemanal({
        waClient: client, intervaloMs: RESUMEN_SEMANAL_MS,
      });

      console.log('▸ arrancando poda-eventos (diario)');
      podaEventosInterval = iniciarPodaEventos({});

      console.log('▸ arrancando drainer de diferidos (horas de silencio)');
      diferidosInterval = iniciarDiferidosDrainer({
        waClient: client, intervaloMs: DIFERIDOS_MS,
      });

      mem.log({
        usuarioId: owner?.id || null,
        canal: 'sistema', direccion: 'interno',
        cuerpo: `Maria arrancó — WA, Gmail, recordatorios, programados, brief y meeting-prep activos (${activos.length} usuarios)`,
      });
  };

  // MODO DEGRADADO (2026-07-05, incidente WA-en-revisión): si el marker de
  // WA-caído (lo escribe el loop de Telegram) tiene >5 min al boot, WhatsApp
  // no va a volver solo — arrancamos gmail + loops SIN esperar el ready para
  // que Maria siga operando por email/Telegram. Cuando WA finalmente conecte,
  // onReady hace exit(0) → pm2 reinicia limpio en modo normal.
  const WA_DEGRADADO_MS = Number(process.env.WA_DEGRADADO_MS || 5 * 60 * 1000);
  try {
    const _mk = path.join(path.dirname(path.dirname(process.env.MARIA_DB || './db/x')), 'tg-wa-down');
    if (fs.existsSync(_mk)) {
      const _desde = Number(String(fs.readFileSync(_mk, 'utf8')).split(' ')[0]) || 0;
      if (_desde && Date.now() - _desde > WA_DEGRADADO_MS) {
        _modoDegradado = true;
        waEstado.degradado = true;
        console.warn(`⚠️ [MODO DEGRADADO] WA caído hace ${Math.round((Date.now() - _desde) / 60000)} min — arranco gmail+loops SIN WhatsApp (envíos a usuarios via telegram/email)`);
        mem.log({ canal: 'sistema', direccion: 'interno',
          cuerpo: `MODO DEGRADADO: loops arrancados sin WA (caído hace ${Math.round((Date.now() - _desde) / 60000)} min)`,
          metadata: { tipo: 'wa_degradado' } });
        arrancarLoops(null);
      }
    }
  } catch (e) { console.warn('[degradado] check falló:', e.message); }

  // 3) WhatsApp — cuando esté listo arrancamos Gmail + loops
  waClient = crearClienteWA({
    waEstado,
    onReady: (client) => {
      waEstado.ready = true;
      if (_modoDegradado) {
        // Los loops corren con client=null — reinicio limpio a modo normal.
        console.log('✅ WA volvió estando en modo degradado — exit(0) para reinicio limpio con WA');
        mem.log({ canal: 'sistema', direccion: 'interno', cuerpo: 'WA recuperado en modo degradado — reinicio limpio' });
        setTimeout(() => process.exit(0), 1500);
        return;
      }
      arrancarLoops(client);    },
  });

  waClient.initialize();
}

// ─── Shutdown limpio ────────────────────────────────────────────────────

function shutdown(sig) {
  console.log(`\n▸ ${sig} recibido, cerrando…`);
  mem.log({
    canal: 'sistema', direccion: 'interno',
    cuerpo: `shutdown por ${sig}`,
  });
  if (gmailInterval) clearInterval(gmailInterval);
  if (recordatoriosInterval) clearInterval(recordatoriosInterval);
  if (programadosInterval) clearInterval(programadosInterval);
  if (briefInterval) clearInterval(briefInterval);
  if (meetingPrepInterval) clearInterval(meetingPrepInterval);
  if (calendarWatchInterval) clearInterval(calendarWatchInterval);
  if (followUpsInterval) clearInterval(followUpsInterval);
  if (memoriaCuradaInterval) clearInterval(memoriaCuradaInterval);
  if (mariaWorkerInterval) clearInterval(mariaWorkerInterval);
  if (cumpleAvisosInterval) clearInterval(cumpleAvisosInterval);
  if (resumenSemanalInterval) clearInterval(resumenSemanalInterval);
  if (podaEventosInterval) clearInterval(podaEventosInterval);
  const done = () => process.exit(0);
  if (waClient) {
    waClient.destroy().then(done).catch(done);
    setTimeout(done, 5000).unref();
  } else {
    done();
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
  mem.log({
    canal: 'sistema', direccion: 'interno',
    cuerpo: `uncaughtException: ${err.message}`,
    metadata: { stack: err.stack },
  });
});
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
  mem.log({
    canal: 'sistema', direccion: 'interno',
    cuerpo: `unhandledRejection: ${reason?.message || reason}`,
  });
});

main().catch((err) => {
  console.error('[fatal]', err);
  process.exit(1);
});
