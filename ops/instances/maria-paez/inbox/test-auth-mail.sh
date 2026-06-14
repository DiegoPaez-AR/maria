#!/bin/bash
set +e
cd /root/secretaria || exit 1
STAMP=$(date +%s)
cat > /tmp/test-auth-mail.js <<JS
const g = require('./google');
const STAMP = "${STAMP}";
(async () => {
  const verifier = 'check-auth@verifier.port25.com';
  const self = g.MARIA_EMAIL;
  console.log('FROM (Maria):', self, '| FROM_NAME:', g.MARIA_FROM_NAME);
  try { const r = await g.enviarEmail({ to: verifier, asunto: 'Auth test '+STAMP, texto: 'Test SPF/DKIM/DMARC para intensa.io. '+STAMP }); console.log('OK envio verifier id=', r.id); }
  catch(e){ console.log('ERROR envio verifier:', e.message); }
  try { const r = await g.enviarEmail({ to: self, asunto: 'Auth self '+STAMP, texto: 'self copy '+STAMP }); console.log('OK envio self id=', r.id); }
  catch(e){ console.log('ERROR envio self:', e.message); }

  console.log('esperando 70s la respuesta del verifier...');
  await new Promise(r => setTimeout(r, 70000));

  const { google } = require('googleapis');
  const auth = await g.autenticar();
  const gmail = google.gmail({ version:'v1', auth });
  async function dump(q, label){
    const list = await gmail.users.messages.list({ userId:'me', q, maxResults:5 });
    const ids = (list.data.messages||[]).map(m=>m.id);
    console.log('\n===== '+label+' (q='+q+') -> '+ids.length+' msgs =====');
    for (const id of ids){
      const m = await gmail.users.messages.get({ userId:'me', id, format:'full' });
      const H = Object.fromEntries((m.data.payload?.headers||[]).map(h=>[h.name.toLowerCase(), h.value]));
      console.log('--- subj="'+(H.subject||'')+'" from="'+(H.from||'')+'" ---');
      if (H['authentication-results']) console.log('Authentication-Results: '+H['authentication-results']);
      if (H['received-spf']) console.log('Received-SPF: '+H['received-spf']);
      try { const full = await g.leerEmail(id);
        const lines = (full.cuerpo||'').split('\n').filter(l=>/spf|dkim|dmarc|result|summary|pass|fail|signature/i.test(l));
        if (lines.length) console.log('Body:\n'+lines.slice(0,30).join('\n'));
      } catch(e){}
    }
  }
  await dump('from:port25.com newer_than:1d', 'VERIFIER REPLY');
  await dump('subject:"Auth self '+STAMP+'"', 'SELF COPY');
})().catch(e=>console.log('FATAL', e.message, e.stack));
JS
node /tmp/test-auth-mail.js 2>&1
rm -f /tmp/test-auth-mail.js
