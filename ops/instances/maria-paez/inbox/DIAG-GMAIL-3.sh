#!/bin/bash
cd /root/secretaria && set -a; . config/instances/maria-paez.conf 2>/dev/null; . config/secrets.conf 2>/dev/null; set +a
node - <<'NODE'
(async () => {
  const g = require('/root/secretaria/google');
  const auth = await g.autenticar();
  const { google } = require('googleapis');
  const gm = google.gmail({ version: 'v1', auth });
  const q = async (query) => ((await gm.users.messages.list({ userId: 'me', q: query, maxResults: 20 })).data.messages || []).length;
  console.log('spam últimos 5d:', await q('in:spam newer_than:5d'));
  console.log('TODO (anywhere) recibido últimos 5d:', await q('in:anywhere -from:me newer_than:5d'));
  console.log('inbox recibido últimos 5d:', await q('in:inbox -from:me newer_than:5d'));
  console.log('enviados últimos 5d:', await q('from:me newer_than:5d'));
  const spam = await gm.users.messages.list({ userId: 'me', q: 'in:spam newer_than:5d', maxResults: 8 });
  for (const m of (spam.data.messages || [])) {
    const f = await gm.users.messages.get({ userId: 'me', id: m.id, format: 'metadata', metadataHeaders: ['From','Subject','Date'] });
    const h = Object.fromEntries(f.data.payload.headers.map(x => [x.name.toLowerCase(), x.value]));
    console.log('SPAM:', (h.date||'').slice(0,22), '|', (h.from||'').slice(0,40), '|', (h.subject||'').slice(0,40));
  }
  const todos = await gm.users.messages.list({ userId: 'me', q: 'in:anywhere -from:me newer_than:5d', maxResults: 10 });
  for (const m of (todos.data.messages || [])) {
    const f = await gm.users.messages.get({ userId: 'me', id: m.id, format: 'metadata', metadataHeaders: ['From','Subject','Date'] });
    const h = Object.fromEntries(f.data.payload.headers.map(x => [x.name.toLowerCase(), x.value]));
    console.log('RECIBIDO:', (h.date||'').slice(0,22), '|', (h.from||'').slice(0,40), '|', (h.subject||'').slice(0,40), '| labels:', (f.data.labelIds||[]).join(','));
  }
})().catch(e => { console.error('FALLO:', e.message); process.exit(1); });
NODE
