// auth-gmail.js — re-autorización OAuth manual de Maria contra Google.
//
// Se corre standalone (no como parte del runtime) cuando hay que generar un
// token.json nuevo: tras un invalid_grant, al cambiar de proyecto OAuth, o
// al onboardear una instancia nueva.
//
// Lee credentials.json y escribe token.json en los paths del .conf de la
// instancia (env vars GOOGLE_CRED_PATH / GOOGLE_TOKEN_PATH), igual que
// google.js. Si las env vars no están, cae al cwd como fallback.
//
// Uso (ejemplo para maria-paez):
//   GOOGLE_CRED_PATH=/root/secretaria/state/maria-paez/credentials.json \
//   GOOGLE_TOKEN_PATH=/root/secretaria/state/maria-paez/token.json \
//   node auth-gmail.js

const { google } = require('googleapis');
const vault = require('./vault');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const SCOPES = [
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/calendar'
];
const CREDENTIALS_PATH = process.env.GOOGLE_CRED_PATH  || path.join(__dirname, 'credentials.json');
const TOKEN_PATH       = process.env.GOOGLE_TOKEN_PATH || path.join(__dirname, 'token.json');

console.log(`Leyendo credentials de: ${CREDENTIALS_PATH}`);
console.log(`Escribiré token en:    ${TOKEN_PATH}`);
console.log('');

const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
const info = credentials.installed || credentials.web;
const { client_secret, client_id, redirect_uris } = info;
const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',   // fuerza emitir refresh_token nuevo aunque ya haya consent previo
    scope: SCOPES,
});

console.log('Abrí este enlace en tu navegador (logueado con la cuenta de Maria) y autorizá:');
console.log('\n' + authUrl + '\n');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question('Pegá acá el código que te dio Google: ', (code) => {
    rl.close();
    oAuth2Client.getToken(code.trim(), (err, token) => {
        if (err) return console.error('Error:', err);
        const encPath = `${TOKEN_PATH}.enc`;
        const usarVault = vault.tieneKey();
        // Backup del token viejo si existe (plano o cifrado).
        const stamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
        if (fs.existsSync(TOKEN_PATH)) {
            const bak = `${TOKEN_PATH}.bak.${stamp}`;
            fs.copyFileSync(TOKEN_PATH, bak);
            console.log(`Backup del token plano anterior: ${bak}`);
        }
        if (fs.existsSync(encPath)) {
            const bak = `${encPath}.bak.${stamp}`;
            fs.copyFileSync(encPath, bak);
            console.log(`Backup del token cifrado anterior: ${bak}`);
        }
        // Persistir en el formato adecuado.
        if (usarVault) {
            vault.cifrarArchivo(encPath, token);
            console.log(`✅ Token nuevo guardado CIFRADO en ${encPath}`);
            // Si quedó un .json plano, removerlo — el plano deja de ser fuente de verdad.
            if (fs.existsSync(TOKEN_PATH)) {
                fs.unlinkSync(TOKEN_PATH);
                console.log(`   (token plano ${TOKEN_PATH} removido — el .enc es la nueva fuente)`);
            }
        } else {
            fs.writeFileSync(TOKEN_PATH, JSON.stringify(token, null, 2));
            console.log(`✅ Token nuevo guardado PLANO en ${TOKEN_PATH} (MARIA_VAULT_KEY no seteado)`);
        }
        console.log(`   refresh_token: ${token.refresh_token ? 'presente' : '⚠️  AUSENTE — Google no lo emitió'}`);
        if (!token.refresh_token) {
            console.log('   Si el refresh_token vino ausente, revocá el acceso desde');
            console.log('   https://myaccount.google.com/permissions y volvé a correr este script.');
        }
    });
});
