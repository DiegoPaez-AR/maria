#!/bin/bash
# Reauth de Maria con la app ya trusteada en el Workspace intensa.io.
# Code nuevo + aceptar share del calendar de Diego + smoke completo incluyendo
# refresh manual del access_token para confirmar que el refresh_token persiste.
set -euo pipefail

CODE='4/0AeoWuM9BtNda1tNKmWjQ5ndWR399hLecRsduGJwtjmzrNps7aPNRH7JAx-dukA1RKejz7A'
SLUG='maria-paez'
STATE="/root/secretaria/state/${SLUG}"
STAMP=$(date +%Y%m%dT%H%M%S)

cd /root/secretaria

echo "── 1. Backup token actual ──"
if [ -f "${STATE}/token.json.enc" ]; then
  cp -p "${STATE}/token.json.enc" "${STATE}/token.json.enc.bak.${STAMP}"
  echo "  → token.json.enc.bak.${STAMP}"
fi

echo
echo "── 2. Exchange code nuevo ──"
node auth-gmail.js exchange "${CODE}"

echo
echo "── 3. pm2 reload (limpiar cache de _authClient en proceso vivo) ──"
pm2 reload ecosystem.config.js --only "${SLUG}" --update-env
sleep 3
pm2 list | grep -E "name|${SLUG}" || true

echo
echo "── 4. Aceptar share del calendar de Diego + listar ──"
node -e "
process.chdir('/root/secretaria');
const g = require('./google');
(async () => {
  const r = await g.aceptarCalendarShare('diego@paez.is');
  console.log('aceptarCalendarShare:', JSON.stringify(r));

  console.log('');
  console.log('FROM_EMAIL del módulo:', g.MARIA_EMAIL);
  const cals = await g.listarCalendarios();
  console.log('listarCalendarios n=' + cals.length);
  for (const c of cals) {
    console.log(' ' + (c.primary?'★':' ') + ' ' + c.id + '  (' + c.accessRole + ')  — ' + (c.summary || ''));
  }
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
"

echo
echo "── 5. Test: ¿el refresh_token sobrevive? (refresh manual) ──"
node -e "
const { google } = require('googleapis');
const fs = require('fs');
const v = require('./vault');
const creds = JSON.parse(fs.readFileSync('${STATE}/credentials.json'));
const info = creds.installed || creds.web;
const cli = new google.auth.OAuth2(info.client_id, info.client_secret, info.redirect_uris[0]);
const tok = v.descifrarArchivo('${STATE}/token.json.enc');
cli.setCredentials(tok);
cli.refreshAccessToken((err, newTok) => {
  if (err) {
    console.log('✗ REFRESH FALLÓ:', err.message);
    console.log('  Detalle:', err.response && err.response.data);
    process.exit(1);
  }
  console.log('✓ refresh OK, scope=' + newTok.scope);
  console.log('  expira:', new Date(newTok.expiry_date).toISOString());
});
"

echo
echo "── done ──"
