#!/bin/bash
# Diagnóstico: por qué el token nuevo (post-cambio de mail) falla auth en un
# proceso standalone aunque el smoke atómico minutos atrás funcionó.
set -uo pipefail
cd /root/secretaria
STATE="/root/secretaria/state/maria-paez"

echo "── 1. files del state ──"
ls -la "$STATE" | grep -E 'token\.json|\.enc' || true

echo
echo "── 2. shape del token cifrado actual ──"
node -e "
const v = require('./vault');
const fs = require('fs');
const enc = '/root/secretaria/state/maria-paez/token.json.enc';
try {
  const t = v.descifrarArchivo(enc);
  console.log('refresh_token   :', t.refresh_token ? 'presente (' + t.refresh_token.length + ' chars)' : 'AUSENTE');
  console.log('access_token    :', t.access_token  ? 'presente (' + t.access_token.length  + ' chars)' : 'AUSENTE');
  console.log('scope           :', t.scope || '(missing)');
  console.log('token_type      :', t.token_type);
  console.log('expiry_date     :', t.expiry_date, '(now=' + Date.now() + ', expirado=' + (t.expiry_date && t.expiry_date < Date.now()) + ')');
  console.log('id_token        :', t.id_token ? 'presente' : 'no');
  console.log('keys            :', Object.keys(t).join(', '));
} catch (e) {
  console.log('ERROR descifrando:', e.message);
}
"

echo
echo "── 3. intento refresh manual del access_token con googleapis ──"
node -e "
const { google } = require('googleapis');
const fs = require('fs');
const v = require('./vault');

const creds = JSON.parse(fs.readFileSync('/root/secretaria/state/maria-paez/credentials.json'));
const info = creds.installed || creds.web;
const cli = new google.auth.OAuth2(info.client_id, info.client_secret, info.redirect_uris[0]);

const tok = v.descifrarArchivo('/root/secretaria/state/maria-paez/token.json.enc');
cli.setCredentials(tok);

cli.refreshAccessToken((err, newTok) => {
  if (err) {
    console.log('REFRESH FALLÓ:', err.message);
    console.log('Detalle:', err.response && err.response.data);
    return;
  }
  console.log('REFRESH OK. nuevo access_token len:', newTok.access_token && newTok.access_token.length);
  console.log('scope devuelto:', newTok.scope);
  console.log('expiry_date   :', newTok.expiry_date);
});
"
