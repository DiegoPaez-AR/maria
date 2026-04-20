const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const TOKEN_PATH = path.join(__dirname, 'token.json');
const CRED_PATH  = path.join(__dirname, 'credentials.json');

async function main() {
  const creds = JSON.parse(fs.readFileSync(CRED_PATH, 'utf8'));
  const { client_secret, client_id, redirect_uris } = creds.installed || creds.web;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
  oAuth2Client.setCredentials(JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8')));

  const calendar = google.calendar({ version: 'v3', auth: oAuth2Client });

  console.log('=== calendarList ===');
  const list = await calendar.calendarList.list();
  for (const c of list.data.items) {
    console.log(`  - ${c.id}  (summary: ${c.summary}, accessRole: ${c.accessRole})`);
  }

  console.log('\n=== Eventos de "primary" (próximos 10) ===');
  const primary = await calendar.events.list({
    calendarId: 'primary',
    timeMin: new Date().toISOString(),
    maxResults: 10, singleEvents: true, orderBy: 'startTime',
  });
  for (const e of primary.data.items) {
    console.log(`  - ${(e.start.dateTime||e.start.date)}  ${e.summary}`);
  }

  console.log('\n=== Eventos de "diego@paez.is" (próximos 10) ===');
  try {
    const d = await calendar.events.list({
      calendarId: 'diego@paez.is',
      timeMin: new Date().toISOString(),
      maxResults: 10, singleEvents: true, orderBy: 'startTime',
    });
    for (const e of d.data.items) {
      console.log(`  - ${(e.start.dateTime||e.start.date)}  ${e.summary}`);
    }
  } catch (err) {
    console.log('  ✗ Error accediendo a diego@paez.is:', err.message);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
