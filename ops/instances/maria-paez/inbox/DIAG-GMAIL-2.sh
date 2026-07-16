#!/bin/bash
cd /root/secretaria && set -a; . config/instances/maria-paez.conf 2>/dev/null; . config/secrets.conf 2>/dev/null; set +a
node - <<'NODE'
(async () => {
  const g = require('/root/secretaria/google');
  const auth = await g.autenticar();
  const { google } = require('googleapis');
  const gm = google.gmail({ version: 'v1', auth });
  const unread = await gm.users.messages.list({ userId: 'me', q: 'is:unread in:inbox', maxResults: 10 });
  console.log('NO LEÍDOS en inbox:', (unread.data.messages || []).length);
  const recientes = await gm.users.messages.list({ userId: 'me', q: 'in:inbox newer_than:4d', maxResults: 15 });
  console.log('En inbox últimos 4 días:', (recientes.data.messages || []).length);
  for (const m of (recientes.data.messages || []).slice(0, 10)) {
    const f = await gm.users.messages.get({ userId: 'me', id: m.id, format: 'metadata', metadataHeaders: ['From', 'Subject', 'Date'] });
    const h = Object.fromEntries(f.data.payload.headers.map(x => [x.name.toLowerCase(), x.value]));
    console.log('-', (f.data.labelIds || []).includes('UNREAD') ? 'NOLEIDO' : 'leido  ', '|', (h.date || '').slice(0, 22), '|', (h.from || '').slice(0, 45), '|', (h.subject || '').slice(0, 45));
  }
  console.log('== qué devuelve listarEmailsNoLeidos de Maria =='); 
  const propios = await g.listarEmailsNoLeidos({ max: 20 });
  console.log('listarEmailsNoLeidos:', propios.length);
})().catch(e => { console.error('FALLO:', e.message); process.exit(1); });
NODE
