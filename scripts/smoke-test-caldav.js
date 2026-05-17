#!/usr/bin/env node
// scripts/smoke-test-caldav.js — verificación end-to-end del provider CalDAV.
//
// Uso:
//   CALDAV_CREDS_FILE=/path/to/creds.json node scripts/smoke-test-caldav.js
//   o
//   CALDAV_SERVER_URL=... CALDAV_USERNAME=... CALDAV_PASSWORD=... node scripts/smoke-test-caldav.js
//
// El JSON de CALDAV_CREDS_FILE tiene la misma shape que el calendar_auth_json:
//   { "server_url": "...", "username": "...", "password": "...", "calendar_url": "..." (opcional) }
//
// Lo que hace, en orden:
//   1. discover: conecta y lista calendarios.
//   2. listar: trae eventos próximos 7 días.
//   3. crear: agenda un evento de prueba "Maria smoke test" 24h en el futuro.
//   4. obtener: re-fetch el evento creado por su URL.
//   5. modificar: cambia el summary.
//   6. borrar: lo elimina.
//   7. confirma: re-fetch debe devolver null.
//
// Output: cada paso imprime ✓/✗ + detalle. Exit 0 si todos pasaron, 1 si alguno falló.
// NO toca DB ni vault — corre 100% standalone contra el server real.

const path = require('path');
const fs = require('fs');

function leerCreds() {
  if (process.env.CALDAV_CREDS_FILE) {
    const raw = fs.readFileSync(process.env.CALDAV_CREDS_FILE, 'utf8');
    return JSON.parse(raw);
  }
  const { CALDAV_SERVER_URL: server_url, CALDAV_USERNAME: username, CALDAV_PASSWORD: password, CALDAV_CALENDAR_URL: calendar_url } = process.env;
  if (!server_url || !username || !password) {
    console.error('ERROR: no hay creds. Setear CALDAV_CREDS_FILE o CALDAV_SERVER_URL+CALDAV_USERNAME+CALDAV_PASSWORD.');
    process.exit(2);
  }
  return { server_url, username, password, calendar_url };
}

(async () => {
  const creds = leerCreds();
  console.log(`▸ Smoke test CalDAV contra ${creds.server_url} (user=${creds.username})`);
  console.log('');

  // Construimos un usuario "fake" con calendar_auth_json sin cifrar para
  // bypassear vault — el provider CalDAV usa vault.descifrar pero podemos
  // intercept-ar pasando el blob directo. Estrategia más simple: instanciar
  // la lógica de connect/discover manualmente sin pasar por el module
  // (replicamos el patrón que hace caldav.js).
  const { createDAVClient } = await import('tsdav');

  let exitCode = 0;
  const t0 = Date.now();
  const step = async (label, fn) => {
    process.stdout.write(`  ${label}... `);
    try {
      const r = await fn();
      process.stdout.write(`✓\n`);
      return r;
    } catch (err) {
      process.stdout.write(`✗\n    ${err.message}\n`);
      exitCode = 1;
      throw err;
    }
  };

  let client, calendar, created;

  try {
    client = await step('connect + autenticar', async () => {
      return await createDAVClient({
        serverUrl: creds.server_url,
        credentials: { username: creds.username, password: creds.password },
        authMethod: 'Basic',
        defaultAccountType: 'caldav',
      });
    });

    const cals = await step('discover calendarios', async () => {
      const cs = await client.fetchCalendars();
      if (!cs.length) throw new Error('no devolvió ningún calendario');
      console.log(`    encontrados: ${cs.map(c => c.displayName || c.url).join(', ')}`);
      return cs;
    });

    calendar = creds.calendar_url
      ? cals.find(c => c.url === creds.calendar_url) || cals[0]
      : cals[0];
    console.log(`    usando: ${calendar.displayName || calendar.url}`);

    await step('listar eventos próximos 7d', async () => {
      const now = new Date();
      const fin = new Date(now.getTime() + 7 * 86400000);
      const objs = await client.fetchCalendarObjects({
        calendar,
        timeRange: { start: now.toISOString(), end: fin.toISOString() },
      });
      console.log(`    ${objs.length} evento(s) en la ventana`);
      return objs;
    });

    const uid = `smoke-${Date.now()}@maria-test`;
    const start = new Date(Date.now() + 24 * 3600 * 1000);
    const end = new Date(start.getTime() + 3600 * 1000);
    const pad = n => String(n).padStart(2, '0');
    const isoIcal = d => `${d.getUTCFullYear()}${pad(d.getUTCMonth()+1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
    const ical = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Maria smoke test//ES',
      'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${isoIcal(new Date())}`,
      `DTSTART:${isoIcal(start)}`,
      `DTEND:${isoIcal(end)}`,
      'SUMMARY:Maria smoke test',
      'DESCRIPTION:Evento de prueba\\, se borra solo.',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    created = await step('crear evento de prueba', async () => {
      const res = await client.createCalendarObject({
        calendar, filename: `${uid}.ics`, iCalString: ical,
      });
      if (!res || !res.url) throw new Error('createCalendarObject no devolvió URL');
      console.log(`    URL: ${res.url}`);
      return res;
    });

    await step('obtener evento creado', async () => {
      const objs = await client.fetchCalendarObjects({
        calendar, objectUrls: [created.url],
      });
      if (!objs.length) throw new Error('no encontré el evento recién creado');
      const summary = (objs[0].data.match(/^SUMMARY:(.+)$/m) || [])[1];
      if (summary && summary.trim() !== 'Maria smoke test') {
        throw new Error(`summary no coincide: "${summary}"`);
      }
    });

    await step('modificar summary', async () => {
      const updatedIcal = ical.replace('SUMMARY:Maria smoke test', 'SUMMARY:Maria smoke test (modificado)');
      await client.updateCalendarObject({
        calendarObject: { url: created.url, etag: created.etag, data: updatedIcal },
      });
      const objs = await client.fetchCalendarObjects({
        calendar, objectUrls: [created.url],
      });
      const summary = (objs[0].data.match(/^SUMMARY:(.+)$/m) || [])[1];
      if (!summary || !summary.includes('(modificado)')) {
        throw new Error(`update no aplicó: summary=${summary}`);
      }
    });

    await step('borrar evento', async () => {
      const objs = await client.fetchCalendarObjects({
        calendar, objectUrls: [created.url],
      });
      await client.deleteCalendarObject({
        calendarObject: { url: created.url, etag: objs[0].etag, data: objs[0].data },
      });
    });

    await step('confirmar borrado', async () => {
      const objs = await client.fetchCalendarObjects({
        calendar, objectUrls: [created.url],
      });
      if (objs.length > 0) throw new Error('el evento sigue existiendo después de borrar');
    });

  } catch (err) {
    // step() ya imprimió. Si llegamos acá, exitCode = 1 ya está seteado.
    // Si el create OK pero algo después falló, intentar limpiar.
    if (created && created.url) {
      try {
        await client.deleteCalendarObject({ calendarObject: { url: created.url } });
        console.log(`    [cleanup] evento ${created.url} eliminado`);
      } catch {
        console.warn(`    [cleanup] no pude eliminar ${created.url} — borralo a mano`);
      }
    }
  }

  console.log('');
  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  if (exitCode === 0) {
    console.log(`✅ Todos los pasos OK (${dt}s)`);
  } else {
    console.log(`❌ Smoke test falló (${dt}s) — ver detalle arriba`);
  }
  process.exit(exitCode);
})().catch(err => {
  console.error('Error no manejado:', err);
  process.exit(2);
});
