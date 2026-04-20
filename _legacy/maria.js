const { google } = require('googleapis');
const { execSync } = require('child_process');
const fs = require('fs');

const TOKEN_PATH = './token.json';
const CREDENTIALS_PATH = './credentials.json';

const IGNORAR = [
    'no-reply', 'noreply', 'no_reply', 'donotreply',
    'google.com', 'accounts.google.com', 'googlemail.com',
    'notifications', 'newsletter', 'mailer-daemon',
    'automated', 'automático', 'bounce',
    'calendar-notification', 'calendar.google.com',
    'invites-noreply', 'accepted', 'declined', 'tentative'
];

function debeIgnorar(from, subject) {
    const fromLower = from.toLowerCase();
    const subjectLower = (subject || '').toLowerCase();
    if (IGNORAR.some(term => fromLower.includes(term))) return true;
    // Ignorar notificaciones de calendario
    const subjectIgnorar = ['accepted:', 'declined:', 'tentative:', 'invitation:', 'canceled:'];
    if (subjectIgnorar.some(term => subjectLower.startsWith(term))) return true;
    // Ignorar emails que Maria se manda a si misma (notificaciones internas)
    if (fromLower.includes('maria.paez.secre@gmail.com')) return true;
    return false;
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

async function getCalendarEvents(calendar) {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 7);
    tomorrow.setHours(23, 59, 59);

    const res = await calendar.events.list({
        calendarId: 'diego@paez.is',
        timeMin: now.toISOString(),
        timeMax: tomorrow.toISOString(),
        singleEvents: true,
        orderBy: 'startTime'
    });

    const events = res.data.items || [];
    if (events.length === 0) return 'No hay eventos en el calendario para hoy ni mañana.';
    
    return events.map(e => {
        const start = e.start.dateTime || e.start.date;
        return `- ${start}: ${e.summary} [id:${e.id}]`;
    }).join('\n');
}

async function getUnreadEmails(gmail) {
    const res = await gmail.users.messages.list({
        userId: 'me',
        q: 'is:unread -from:maria.paez.secre@gmail.com',
        maxResults: 5
    });
    return res.data.messages || [];
}

async function getEmailContent(gmail, messageId) {
    const msg = await gmail.users.messages.get({ userId: 'me', id: messageId, format: 'full' });
    const headers = msg.data.payload.headers;
    const subject = headers.find(h => h.name === 'Subject')?.value || '(sin asunto)';
    const from = headers.find(h => h.name === 'From')?.value || '(desconocido)';
    const to = headers.find(h => h.name === 'To')?.value || '';
    const cc = headers.find(h => h.name === 'Cc')?.value || '';
    const messageIdHeader = headers.find(h => h.name === 'Message-ID')?.value || '';
    let body = '';
    if (msg.data.payload.parts) {
        const part = msg.data.payload.parts.find(p => p.mimeType === 'text/plain');
        if (part?.body?.data) body = Buffer.from(part.body.data, 'base64').toString();
    } else if (msg.data.payload.body?.data) {
        body = Buffer.from(msg.data.payload.body.data, 'base64').toString();
    }
    return { subject, from, to, cc, body: body.slice(0, 500), id: messageId, threadId: msg.data.threadId, messageIdHeader };
}

async function replyToEmail(gmail, email, replyText) {
    // Armar lista de todos los participantes para reply-all
    const todos = new Set();
    // Agregar remitente original
    todos.add(email.from);
    // Agregar todos los TO
    if (email.to) email.to.split(',').map(e => e.trim()).forEach(e => todos.add(e));
    // Agregar todos los CC
    if (email.cc) email.cc.split(',').map(e => e.trim()).forEach(e => todos.add(e));
    // Quitar a Maria misma
    const sinMaria = [...todos].filter(e => !e.includes('maria.paez.secre@gmail.com'));
    
    const toFinal = sinMaria[0] || email.from;
    const ccFinal = sinMaria.slice(1).join(', ');

    let headers = `From: Maria Paez <maria.paez.secre@gmail.com>\nTo: ${toFinal}\n`;
    if (ccFinal) headers += `Cc: ${ccFinal}\n`;
    headers += `Subject: Re: ${email.subject}\nIn-Reply-To: ${email.messageIdHeader}\nReferences: ${email.messageIdHeader}\nContent-Type: text/plain; charset=utf-8`;

    const raw = Buffer.from(`${headers}\n\n${replyText}`)
        .toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
    
    await gmail.users.messages.send({
        userId: 'me',
        requestBody: { raw, threadId: email.threadId }
    });
    await gmail.users.messages.modify({
        userId: 'me', id: email.id,
        requestBody: { removeLabelIds: ['UNREAD'] }
    });
}


async function modificarEventoCalendario(calendar, eventoId, cambios) {
    try {
        const res = await calendar.events.patch({
            calendarId: 'primary',
            eventId: eventoId,
            sendUpdates: 'all',
            requestBody: cambios
        });
        console.log('📅 Evento modificado:', res.data.summary);
        return res.data;
    } catch (e) {
        console.error('Error modificando evento:', e.message);
        return null;
    }
}
async function crearEventoCalendario(calendar, evento) {
    try {
        const res = await calendar.events.insert({
            calendarId: 'primary',
            requestBody: evento,
            sendUpdates: 'all' // envia invitaciones a los asistentes
        });
        console.log(`📅 Evento creado: ${res.data.summary}`);
        return res.data;
    } catch (e) {
        console.error('Error creando evento:', e.message);
        return null;
    }
}

async function main() {
    const { gmail, calendar } = await getClients();
    const messages = await getUnreadEmails(gmail);
    
    if (messages.length === 0) {
        console.log('No hay emails nuevos.');
        return;
    }

    console.log(`Procesando ${messages.length} email(s) nuevos...`);
    
    for (const msg of messages) {
        const email = await getEmailContent(gmail, msg.id);
        
        if (debeIgnorar(email.from, email.subject)) {
            console.log(`⏭️  Ignorado (automático): ${email.from}`);
            await gmail.users.messages.modify({
                userId: 'me', id: email.id,
                requestBody: { removeLabelIds: ['UNREAD'] }
            });
            continue;
        }

        console.log(`\nDe: ${email.from}\nAsunto: ${email.subject}`);

        const calendarInfo = await getCalendarEvents(calendar);
        const ahoraISO = new Date().toISOString();
        
        const instrucciones = fs.readFileSync('./instrucciones.txt', 'utf8');
        const prompt = `${instrucciones}

Agenda de Diego para hoy y manana:
${calendarInfo}

Fecha y hora actual: ${ahoraISO}
De: ${email.from}
Para: ${email.to}
CC: ${email.cc}
Asunto: ${email.subject}
Mensaje: ${email.body}

Escribe el cuerpo de la respuesta. Si vas a crear o modificar un evento, agregalo al final con el formato indicado en las instrucciones.`;
        
        const respuestaCompleta = execSync(`claude -p "${prompt.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`, { encoding: 'utf8' }).trim();
        
        // Separar el texto del evento si existe
        const partes = respuestaCompleta.split('CREAR_EVENTO:');
        const replyText = partes[0].trim();
        
        await replyToEmail(gmail, email, replyText);
        console.log(`✅ Respondido: ${email.subject}`);

        // Crear evento si Claude lo indicó
        if (partes[1]) {
            try {
                const eventoJSON = partes[1].trim();
                console.log("JSON evento:", eventoJSON); const evento = JSON.parse(eventoJSON);
                await crearEventoCalendario(calendar, evento);
            } catch (e) {
                console.error('No se pudo parsear el evento:', e.message);
            }
        }
    }
}

main().catch(console.error);

async function enviarResumenDiario() {
    const { gmail, calendar } = await getClients();
    
    const ahoraBA = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }));
    const inicioDelDia = new Date(ahoraBA);
    inicioDelDia.setHours(0, 0, 0, 0);
    const finDelDia = new Date(ahoraBA);
    finDelDia.setHours(23, 59, 59, 0);

    const res = await calendar.events.list({
        calendarId: 'diego@paez.is',
        timeMin: inicioDelDia.toISOString(),
        timeMax: finDelDia.toISOString(),
        singleEvents: true,
        orderBy: 'startTime'
    });

    const events = (res.data.items || []).filter(e => e.start.dateTime);
    const fecha = ahoraBA.toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    
    let resumen;
    if (events.length === 0) {
        resumen = 'No tenes eventos con hora agendados para hoy.';
    } else {
        resumen = events.map(e => {
            const hora = new Date(e.start.dateTime).toLocaleTimeString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit', hour12: false });
            return hora + 'hs.    ' + e.summary;
        }).join('\n');
    }

    const prompt = `Eres Maria Paez, secretaria personal de Diego Paez. Escribi un resumen diario en español para Diego. Empieza directamente con "Buenos dias Diego," seguido de la lista de eventos. No agregues parrafos finales ni despedidas ni comentarios extra. Solo el saludo inicial y la lista.

Fecha: ${fecha}
Eventos de hoy:
${resumen}

Escribe solo el cuerpo del email, sin asunto ni encabezados, sin parrafo de cierre.`;
    
    const cuerpo = execSync(`claude -p "${prompt.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`, { encoding: 'utf8' }).trim();

    const subject = 'Resumen del dia - ' + fecha;
    const rawStr = 'From: Maria Paez <maria.paez.secre@gmail.com>\nTo: diego@paez.is\nSubject: =?UTF-8?B?' + Buffer.from(subject).toString('base64') + '?=\nContent-Type: text/plain; charset=utf-8\n\n' + cuerpo;
    
    const raw = Buffer.from(rawStr).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');

    await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
    console.log('Resumen diario enviado a diego@paez.is');
}

if (process.argv[2] === '--resumen') {
    enviarResumenDiario().catch(console.error);
}
