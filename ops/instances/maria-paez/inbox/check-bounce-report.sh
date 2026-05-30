#!/bin/bash
set -uo pipefail
cd /root/secretaria
cf=config/instances/maria-paez.conf; set -a; . "$cf"; set +a
node -e "
const g=require('./google');
(async()=>{
  await g.autenticar();
  const { google } = require('googleapis');
  // reusar el auth interno via un mensaje list directo
  // buscamos rebotes / mailer-daemon de los ultimos 4 dias
  const auth = await g.autenticar();
  const gmail = google.gmail({version:'v1', auth});
  for (const q of ['from:mailer-daemon newer_than:4d','subject:(Delivery Status OR no se pudo entregar OR Undelivered OR failure) newer_than:4d','to:diego@paez.is subject:Reporte newer_than:4d in:sent']) {
    try {
      const r = await gmail.users.messages.list({userId:'me', q, maxResults:5});
      const n = (r.data.messages||[]).length;
      console.log('── q:', q, '→', n, 'msgs');
      for (const m of (r.data.messages||[])) {
        const full = await gmail.users.messages.get({userId:'me', id:m.id, format:'metadata', metadataHeaders:['From','To','Subject','Date']});
        const h = Object.fromEntries((full.data.payload.headers||[]).map(x=>[x.name,x.value]));
        console.log('   •', h.Date, '|', h.From, '→', h.To, '|', h.Subject);
      }
    } catch(e){ console.log('   ERR en q=',q,':',e.message); }
  }
})().catch(e=>{console.error('ERR:',e.message);});
"
