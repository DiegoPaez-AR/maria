#!/bin/bash
set -uo pipefail
cd /root/secretaria
node -e "
const g = require('./google');
(async () => {
  const ev = await g.obtenerEvento({
    calendarId: 'diego@paez.is',
    id: '3au003cbo8tfuq0p856ptbmpqs',
  });
  console.log('summary  :', ev.summary);
  console.log('start    :', ev.start);
  console.log('end      :', ev.end);
  console.log('attendees:', JSON.stringify(ev.attendees || [], null, 2));
  console.log('updated  :', ev.updated);
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
"
