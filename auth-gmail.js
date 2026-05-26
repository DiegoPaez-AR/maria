// auth-gmail.js — re-autorización OAuth manual de Maria contra Google.
//
// Se corre standalone (no como parte del runtime) cuando hay que generar un
// token.json nuevo: tras un invalid_grant, al cambiar de proyecto OAuth, al
// onboardear una instancia nueva, o al rotar la cuenta de Maria.
//
// Lee credentials.json y escribe token.json[.enc] en los paths del .conf de
// la instancia (env vars GOOGLE_CRED_PATH / GOOGLE_TOKEN_PATH). El token se
// persiste CIFRADO si MARIA_VAULT_KEY está seteado.
//
// Modos:
//   node auth-gmail.js                  → interactivo (legacy): muestra URL,
//                                         pide code por stdin, persiste token.
//   node auth-gmail.js url              → imprime solo la URL OAuth y sale.
//                                         Útil cuando el reauth se orquesta
//                                         por inbox/Cowork sin TTY.
//   node auth-gmail.js exchange <code>  → intercambia el code (obtenido
//                                         abriendo la URL en un browser),
//                                         persiste token cifrado y backupea
//                                         el viejo. Sin stdin.

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

function _oauthClient() {
    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
    const info = credentials.installed || credentials.web;
    const { client_secret, client_id, redirect_uris } = info;
    return new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
}

function _authUrl(client) {
    return client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',   // fuerza emitir refresh_token nuevo aunque ya haya consent previo
        scope: SCOPES,
    });
}

function _persistirToken(token) {
    const encPath = `${TOKEN_PATH}.enc`;
    const usarVault = vault.tieneKey();
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
    if (usarVault) {
        vault.cifrarArchivo(encPath, token);
        console.log(`✅ Token nuevo guardado CIFRADO en ${encPath}`);
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
        console.log('   https://myaccount.google.com/permissions y volvé a correr el reauth.');
    }
}

async function _intercambiar(code) {
    const client = _oauthClient();
    const { tokens } = await client.getToken(code.trim());
    _persistirToken(tokens);
}

function _modoUrl() {
    const client = _oauthClient();
    // Solo la URL al stdout — nada más, para que el outbox quede limpio.
    process.stdout.write(_authUrl(client) + '\n');
}

function _modoInteractivo() {
    console.log(`Leyendo credentials de: ${CREDENTIALS_PATH}`);
    console.log(`Escribiré token en:    ${TOKEN_PATH}`);
    console.log('');
    const client = _oauthClient();
    console.log('Abrí este enlace en tu navegador (logueado con la cuenta de Maria) y autorizá:');
    console.log('\n' + _authUrl(client) + '\n');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('Pegá acá el código que te dio Google: ', async (code) => {
        rl.close();
        try {
            await _intercambiar(code);
        } catch (err) {
            console.error('Error:', err.message || err);
            process.exit(1);
        }
    });
}

// ─── dispatch ────────────────────────────────────────────────────────────
const mode = (process.argv[2] || '').toLowerCase();

if (mode === 'url') {
    _modoUrl();
} else if (mode === 'exchange') {
    const code = process.argv[3];
    if (!code) {
        console.error('Uso: node auth-gmail.js exchange <code>');
        process.exit(1);
    }
    _intercambiar(code).catch(err => {
        console.error('Error:', err.message || err);
        process.exit(1);
    });
} else if (!mode) {
    _modoInteractivo();
} else {
    console.error(`Modo desconocido: ${mode}. Usá: url | exchange <code> | (vacío para interactivo)`);
    process.exit(1);
}
