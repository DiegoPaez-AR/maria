const { google } = require('googleapis');
const fs = require('fs');
const readline = require('readline');

const SCOPES = [
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/calendar'
];
const CREDENTIALS_PATH = './credentials.json';
const TOKEN_PATH = './token.json';

const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
const { client_secret, client_id, redirect_uris } = credentials.installed;
const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
});

console.log('Abre este enlace en tu navegador y autoriza la cuenta de María:');
console.log('\n' + authUrl + '\n');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question('Pega aquí el código que te dio Google: ', (code) => {
    rl.close();
    oAuth2Client.getToken(code, (err, token) => {
        if (err) return console.error('Error:', err);
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(token));
        console.log('✅ Gmail y Calendar autenticados correctamente');
    });
});
