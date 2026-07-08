#!/bin/bash
cd /root/secretaria
node - <<'NODE'
(async () => {
  const g = require('/root/secretaria/google');
  const auth = await g.autenticar();
  const { google } = require('googleapis');
  const gm = google.gmail({ version: 'v1', auth });
  const list = await gm.users.messages.list({ userId: 'me', q: 'in:sent to:diego@paez.is newer_than:1d', maxResults: 3 });
  for (const m of (list.data.messages || [])) {
    const full = await gm.users.messages.get({ userId: 'me', id: m.id, format: 'full' });
    const h = Object.fromEntries(full.data.payload.headers.map(x => [x.name.toLowerCase(), x.value]));
    let body = '';
    const p = full.data.payload;
    const part = p.parts ? p.parts.find(x => x.mimeType === 'text/plain') : p;
    if (part && part.body && part.body.data) body = Buffer.from(part.body.data, 'base64').toString('utf8');
    console.log('---', h.subject, '|', h.date);
    console.log('tiene t.me:', body.includes('t.me') ? 'SÍ' : 'NO');
    console.log('últimas líneas:'); console.log(body.trim().split('\n').slice(-6).join('\n'));
  }
})().catch(e => { console.error('FALLO:', e.message); process.exit(1); });
NODE
