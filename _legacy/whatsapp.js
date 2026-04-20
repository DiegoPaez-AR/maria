const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { google } = require('googleapis');
const { execSync } = require('child_process');
const fs = require('fs');

const DIEGO = '541132317896@c.us';
const CREDENTIALS_PATH = './credentials.json';
const TOKEN_PATH = './token.json';
const CONTACTOS_PATH = './contactos.json';
const INSTRUCCIONES_PATH = './instrucciones.txt';

// Conversaciones pendientes: esperando respuesta de Diego
const pendientes = {};

function getContactos() {
    return JSON.parse(fs.readFileSync(CONTACTOS_PATH, 'utf8'));
}

function guardarContacto(nombre, numero) {
    const contactos = getContactos();
    contactos[nombre.toLowerCase()] = numero;
    fs.writeFileSync(CONTACTOS_PATH, JSON.stringify(contactos, null, 2));
    console.log(`📒 Contacto guardado: ${nombre} -> ${numero}`);
}

function buscarContacto(nombre) {
    const contactos = getContactos();
    return contactos[nombre.toLowerCase()] || null;
}

async function getClients() {
    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
    const { client_secret, client_id, redirect_uris } = credentials.installed;
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
    oAuth2Client.setCredentials(token);
    return {
        gmail: google.gmail({ version: 'v1', auth: oAuth2Client }),
        calendar: google.calendar({ version: 'v3', auth: oAuth2Client })
    };
}

async function getCalendarEvents() {
    const { calendar } = await getClients();
    const now = new Date();
    const end = new Date(now);
    end.setDate(end.getDate() + 7);
    end.setHours(23, 59, 59);

    const res = await calendar.events.list({
        calendarId: 'diego@paez.is',
        timeMin: now.toISOString(),
        timeMax: end.toISOString(),
        singleEvents: true,
        orderBy: 'startTime'
    });

    const events = res.data.items || [];
    if (events.length === 0) return 'No hay eventos en los proximos 7 dias.';
    return events.map(e => {
        const start = e.start.dateTime || e.start.date;
        return `- ${start}: ${e.summary} [id:${e.id}]`;
    }).join('\n');
}

async function crearEvento(eventoData) {
    const { calendar } = await getClients();
    const res = await calendar.events.insert({
        calendarId: 'primary',
        sendUpdates: 'all',
        requestBody: eventoData
    });
    console.log('📅 Evento creado:', res.data.summary);
    return res.data;
}

async function modificarEvento(eventoId, cambios) {
    const { calendar } = await getClients();
    const res = await calendar.events.patch({
        calendarId: 'primary',
        eventId: eventoId,
        sendUpdates: 'all',
        requestBody: cambios
    });
    console.log('📅 Evento modificado:', res.data.summary);
    return res.data;
}

async function procesarMensajeDiego(client, msg, texto) {
    // Si hay una conversacion pendiente, la respuesta de Diego va al externo
    if (pendientes[msg.from] && texto.startsWith('resp:')) {
        // formato: "resp: [numero o nombre] mensaje"
        // pero en este caso msg.from es Diego respondiendo a una consulta
    }

    // Verificar si Diego esta respondiendo a una consulta pendiente
    const idsPendientes = Object.keys(pendientes);
    for (const id of idsPendientes) {
        if (pendientes[id].esperandoRespuesta) {
            // Diego respondio la consulta pendiente
            const pendiente = pendientes[id];
            delete pendientes[id];
            
            // Enviar respuesta al externo
            await client.sendMessage(id, texto);
            await client.sendMessage(DIEGO, `✅ Respuesta enviada a ${pendiente.nombre || id}`);
            return;
        }
    }

    const calendarInfo = await getCalendarEvents();
    const instrucciones = fs.readFileSync(INSTRUCCIONES_PATH, 'utf8');
    const ahoraISO = new Date().toISOString();

    const prompt = `${instrucciones}

Sos Maria Paez, secretaria de Diego. Diego te esta escribiendo por WhatsApp.
Tenes acceso total para ayudarlo con cualquier tarea.

Agenda de Diego proximos 7 dias:
${calendarInfo}

Fecha y hora actual: ${ahoraISO}

Mensaje de Diego: ${texto}

Si necesitas crear un evento usa al final: CREAR_EVENTO:{...json...}
Si necesitas modificar un evento usa al final: MODIFICAR_EVENTO:{"eventoId":"...","cambios":{...}}
Si necesitas contactar a alguien externo por WhatsApp usa al final: ENVIAR_WA:{"numero":"541112345678","mensaje":"texto"}
Si necesitas buscar un contacto y no lo tenes usa al final: BUSCAR_CONTACTO:{"nombre":"nombre del contacto"}

Responde solo el texto del mensaje, sin firma.`;

    const respuesta = execSync(`claude -p "${prompt.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`, { encoding: 'utf8' }).trim();

    // Procesar acciones
    const partes = respuesta.split(/CREAR_EVENTO:|MODIFICAR_EVENTO:|ENVIAR_WA:|BUSCAR_CONTACTO:/);
    const textoRespuesta = partes[0].trim();

    if (textoRespuesta) await client.sendMessage(DIEGO, textoRespuesta);

    // CREAR_EVENTO
    if (respuesta.includes('CREAR_EVENTO:')) {
        try {
            const json = respuesta.split('CREAR_EVENTO:')[1].split(/MODIFICAR_EVENTO:|ENVIAR_WA:|BUSCAR_CONTACTO:/)[0].trim();
            const evento = JSON.parse(json);
            await crearEvento(evento);
            await client.sendMessage(DIEGO, '📅 Evento creado en el calendario.');
        } catch(e) { console.error('Error creando evento:', e.message); }
    }

    // MODIFICAR_EVENTO
    if (respuesta.includes('MODIFICAR_EVENTO:')) {
        try {
            const json = respuesta.split('MODIFICAR_EVENTO:')[1].split(/CREAR_EVENTO:|ENVIAR_WA:|BUSCAR_CONTACTO:/)[0].trim();
            const mod = JSON.parse(json);
            await modificarEvento(mod.eventoId, mod.cambios);
            await client.sendMessage(DIEGO, '📅 Evento modificado.');
        } catch(e) { console.error('Error modificando evento:', e.message); }
    }

    // ENVIAR_WA
    if (respuesta.includes('ENVIAR_WA:')) {
        try {
            const json = respuesta.split('ENVIAR_WA:')[1].split(/CREAR_EVENTO:|MODIFICAR_EVENTO:|BUSCAR_CONTACTO:/)[0].trim();
            const wa = JSON.parse(json);
            const numeroFormateado = wa.numero.includes('@c.us') ? wa.numero : `${wa.numero}@c.us`;
            await client.sendMessage(numeroFormateado, wa.mensaje);
            await client.sendMessage(DIEGO, `✅ Mensaje enviado a ${wa.numero}`);
        } catch(e) { console.error('Error enviando WA:', e.message); }
    }

    // BUSCAR_CONTACTO
    if (respuesta.includes('BUSCAR_CONTACTO:')) {
        try {
            const json = respuesta.split('BUSCAR_CONTACTO:')[1].trim();
            const bc = JSON.parse(json);
            const numero = buscarContacto(bc.nombre);
            if (numero) {
                await client.sendMessage(DIEGO, `📒 Encontre a ${bc.nombre}: ${numero}. ¿Queres que le escriba?`);
            } else {
                await client.sendMessage(DIEGO, `❓ No tengo el numero de ${bc.nombre}. ¿Me lo pasas?`);
            }
        } catch(e) { console.error('Error buscando contacto:', e.message); }
    }
}

async function procesarMensajeExterno(client, msg, texto, nombreRemitente) {
    const instrucciones = fs.readFileSync(INSTRUCCIONES_PATH, 'utf8');
    const ahoraISO = new Date().toISOString();

    const prompt = `Sos Maria Paez, secretaria de Diego Paez. Te escribio ${nombreRemitente} por WhatsApp.

REGLAS ESTRICTAS PARA EXTERNOS:
- No compartis informacion personal de Diego (agenda, contactos, emails, ubicacion, etc)
- Solo das info relevante para la tarea que Diego te encomendo respecto a esta persona
- Si no sabes que responder o la consulta requiere decision de Diego, responde: CONSULTAR_DIEGO:{"mensaje":"resumen de la situacion para Diego"}
- Respondé de forma cordial y breve
- Sin firma

Fecha y hora actual: ${ahoraISO}
Mensaje de ${nombreRemitente}: ${texto}

Responde solo el texto.`;

    const respuesta = execSync(`claude -p "${prompt.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`, { encoding: 'utf8' }).trim();

    if (respuesta.includes('CONSULTAR_DIEGO:')) {
        try {
            const json = respuesta.split('CONSULTAR_DIEGO:')[1].trim();
            const consulta = JSON.parse(json);
            // Guardar pendiente
            pendientes[msg.from] = { 
                nombre: nombreRemitente, 
                numero: msg.from,
                esperandoRespuesta: true,
                mensaje: texto
            };
            await client.sendMessage(DIEGO, `❓ *Consulta de ${nombreRemitente}:*\n${consulta.mensaje}\n\nRespondeme directo y le reenvio tu respuesta.`);
        } catch(e) { console.error('Error consultando a Diego:', e.message); }
    } else {
        await client.sendMessage(msg.from, respuesta);
    }
}

const client = new Client({
    authStrategy: new LocalAuth(),
    // webVersionCache: { type: 'local' }, // DESHABILITADO para debug de handshake
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled', '--user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36'],
        executablePath: '/usr/bin/google-chrome'
    }
});

client.on('qr', (qr) => {
    console.log('[EVENT qr] Escanea este QR con WhatsApp:');
    qrcode.generate(qr, { small: true });
});

client.on('loading_screen', (percent, message) => {
    console.log(`[EVENT loading_screen] ${percent}% - ${message}`);
});

client.on('authenticated', () => {
    console.log('[EVENT authenticated] Sesion autenticada (antes de estar lista)');
});

client.on('auth_failure', (msg) => {
    console.error('[EVENT auth_failure]', msg);
});

client.on('change_state', (state) => {
    console.log('[EVENT change_state]', state);
});

client.on('disconnected', (reason) => {
    console.error('[EVENT disconnected]', reason);
});

client.on('ready', () => {
    console.log('✅ [EVENT ready] WhatsApp de Maria conectado');
});

client.on('message', async (msg) => {
    if (msg.fromMe) return;

    const texto = msg.body.trim();
    if (!texto) return;

    // Guardar contacto si es una vCard
    if (msg.type === 'vcard') {
        const nombreMatch = msg.body.match(/FN:(.+)/);
        const telMatch = msg.body.match(/TEL[^:]*:(.+)/);
        if (nombreMatch && telMatch) {
            const nombre = nombreMatch[1].trim();
            const numero = telMatch[1].trim().replace(/\D/g, '');
            guardarContacto(nombre, numero);
            await client.sendMessage(msg.from, `📒 Guardé el contacto de ${nombre}.`);
        }
        return;
    }

    console.log(`📱 Mensaje de ${msg.from}: ${texto}`);

    if (msg.from === DIEGO) {
        await procesarMensajeDiego(client, msg, texto);
    } else {
        const contact = await msg.getContact();
        const nombreRemitente = contact.pushname || contact.name || msg.from;
        await procesarMensajeExterno(client, msg, texto, nombreRemitente);
    }
});

process.on('uncaughtException', (err) => console.error('[uncaughtException]', err));
process.on('unhandledRejection', (reason) => console.error('[unhandledRejection]', reason));

client.initialize();
