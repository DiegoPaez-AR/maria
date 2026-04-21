// index.js — entry point unificado de Maria
//
// Reemplaza la división whatsapp.js + maria.js por un único proceso que:
//   1) arranca el cliente de WhatsApp (whatsapp-handler.js)
//   2) cuando WA está listo, inicia el poll de Gmail (gmail-handler.js)
//   3) ambos comparten memory (SQLite) y google.js
//
// Variables de entorno útiles:
//   DIEGO_WA        → wa id de Diego (default 541132317896@c.us)
//   DIEGO_EMAIL     → email de Diego (default diego@paez.is)
//   GMAIL_POLL_MS   → intervalo de poll en ms (default 60000)
//   CHROME_BIN      → binary de Chrome (default /usr/bin/google-chrome)
//   MARIA_DB        → path de sqlite (default ./db/maria.sqlite)
//   MARIA_CALENDAR_ID, MARIA_TZ → ver google.js
//   WHISPER_BIN, WHISPER_MODEL, WHISPER_LANG → ver transcribir.js

const path = require('path');

const mem = require('./memory');
const { verificarDependencias } = require('./transcribir');
const { crearClienteWA } = require('./whatsapp-handler');
const { iniciarPoll } = require('./gmail-handler');
const { iniciarRecordatorios } = require('./recordatorios');
const { iniciarProgramados } = require('./programados');
const { iniciarMorningBrief } = require('./morning-brief');
const { iniciarMeetingPrep } = require('./meeting-prep');

const DIEGO_WA        = process.env.DIEGO_WA        || '541132317896@c.us';
const DIEGO_EMAIL     = process.env.DIEGO_EMAIL     || 'diego@paez.is';
const GMAIL_POLL_MS   = Number(process.env.GMAIL_POLL_MS   || 60_000);
const RECORDATORIO_MS = Number(process.env.RECORDATORIO_MS || 30 * 60_000);
const PROGRAMADOS_MS  = Number(process.env.PROGRAMADOS_MS  || 60_000);
const BRIEF_MS        = Number(process.env.BRIEF_MS        || 60_000);
const MEETING_PREP_MS = Number(process.env.MEETING_PREP_MS || 5 * 60_000);

let gmailInterval = null;
let recordatoriosInterval = null;
let programadosInterval = null;
let briefInterval = null;
let meetingPrepInterval = null;
let waClient = null;

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('▸ Maria iniciando…');
  console.log(`  Diego WA:    ${DIEGO_WA}`);
  console.log(`  Diego email: ${DIEGO_EMAIL}`);
  console.log(`  Gmail poll:  cada ${GMAIL_POLL_MS/1000}s`);
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

  // 2) Asegurar que Diego está en contactos
  mem.upsertContacto({
    nombre: 'Diego',
    whatsapp: DIEGO_WA,
    email: DIEGO_EMAIL,
    notas: 'jefe / titular',
  });
  console.log('✓ contacto Diego asegurado');

  // 3) Migración oportunista de contactos.json
  try {
    const n = mem.importarDesdeContactosJson(path.join(__dirname, 'contactos.json'));
    if (n) console.log(`✓ importados ${n} contactos de contactos.json`);
  } catch (err) {
    console.warn('[warn] importando contactos.json:', err.message);
  }

  // 4) WhatsApp — cuando esté listo arrancamos Gmail + recordatorios
  waClient = crearClienteWA({
    onReady: (client) => {
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

      console.log('▸ arrancando morning-brief (4am hora AR, ventana 4h)');
      briefInterval = iniciarMorningBrief({
        waClient: client, intervaloMs: BRIEF_MS,
      });

      console.log(`▸ arrancando meeting-prep (cada ${MEETING_PREP_MS/60_000}min)`);
      meetingPrepInterval = iniciarMeetingPrep({
        intervaloMs: MEETING_PREP_MS,
      });

      mem.log({
        canal: 'sistema', direccion: 'interno',
        cuerpo: 'Maria arrancó — WA, Gmail, recordatorios, programados, brief y meeting-prep activos',
      });
    },
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
  const done = () => process.exit(0);
  if (waClient) {
    waClient.destroy().then(done).catch(done);
    setTimeout(done, 5000).unref(); // por las dudas
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
