// i18n.js — strings de los mensajes AUTOMÁTICOS de Maria (brief, recordatorios,
// cumple-avisos, resumen-semanal, meeting-prep) en español/inglés. Default 'es'.
// El idioma sale de usuario.idioma. Las respuestas conversacionales NO usan
// esto (las redacta el LLM en el idioma del usuario); esto es solo para las
// plantillas de código.

function L(idioma) { return idioma === 'en' ? 'en' : 'es'; }
function locale(idioma) { return idioma === 'en' ? 'en-US' : 'es-AR'; }

// WMO weather code → descripción en inglés (clima.js tiene el mapa en español).
const CLIMA_EN = {
  0:'clear', 1:'mostly clear', 2:'partly cloudy', 3:'cloudy',
  45:'fog', 48:'rime fog', 51:'light drizzle', 53:'drizzle', 55:'heavy drizzle',
  56:'freezing drizzle', 57:'heavy freezing drizzle',
  61:'light rain', 63:'rain', 65:'heavy rain', 66:'freezing rain', 67:'heavy freezing rain',
  71:'light snow', 73:'snow', 75:'heavy snow', 77:'snow grains',
  80:'light showers', 81:'showers', 82:'heavy showers', 85:'snow showers', 86:'heavy snow showers',
  95:'thunderstorm', 96:'thunderstorm with hail', 99:'severe thunderstorm with hail',
};

const M = {
  es: {
    // morning-brief
    buenDia: (n, f) => `☀️ *Buen día, ${n}.* ${f}.`,
    climaLbl: (u) => `*🌡️ Clima${u ? ' en ' + u : ''}*`,
    agendaLbl: '*📅 Agenda del día*',
    sinEventos: '(sin eventos hoy)',
    todoElDia: 'todo el día',
    cumplesLbl: '*Cumpleaños hoy*',
    pendientesLbl: '*📝 Pendientes*',
    gestionandoLbl: '*🔄 Gestionando para vos*',
    climaMinMax: (min, max) => `, mín ${min}° / máx ${max}°`,
    climaMax: (max) => `, máx ${max}°`,
    probLluvia: (p) => ` · ${p}% prob. de lluvia`,
    // recordatorios
    recConsultaEnc: (n) => `Te debo consulta sobre ${n === 1 ? 'algo pendiente' : `${n} cosas pendientes`} 👇`,
    recConsultaCierre: 'Decime qué hago con cada uno.',
    recTareaEnc: (n) => `Recordatorio — ${n === 1 ? 'tenés 1 tarea' : `tenés ${n} tareas`} abiertas 📝`,
    recTareaCierre: 'Cuando termines alguna decime "listo <nombre>" y la saco.',
    recDe: (r) => `de ${r}`,
    // cumple-avisos
    cumpleEnc: (plural) => `🎂 *Mañana cumple${plural ? 'n' : ''} años:*`,
    sinWaLibreta: ' (sin WhatsApp en libreta)',
    cumpleCierre: (plural) => `¿Le${plural ? 's' : ''} mando un saludo de tu parte? Decime el tono o pasame el texto y lo mando mañana a primera hora. Si no, ignorá este mensaje.`,
    // resumen-semanal
    tuSemana: (d, m) => `📊 *Tu semana* (al ${d}/${m})`,
    waLine: (i, o) => `💬 WhatsApp: ${i} recibidos · ${o} enviados`,
    mailLine: (i, o) => `📧 Emails: ${i} recibidos · ${o} enviados`,
    eventosLine: (n) => `📅 Eventos agendados: ${n}`,
    pendLine: (c, n, a) => `📝 Pendientes: ${c} cerrados · ${n} nuevos · ${a} abiertos ahora`,
    fuLine: (r, d) => `⏳ Follow-ups: ${r} resueltos · ${d} disparados`,
    arrancas: '*Arrancás la semana con:*',
    // meeting-prep
    enMin: (m) => `⏰ *En ${m}min*:`,
    con: 'Con:',
  },
  en: {
    buenDia: (n, f) => `☀️ *Good morning, ${n}.* ${f}.`,
    climaLbl: (u) => `*🌡️ Weather${u ? ' in ' + u : ''}*`,
    agendaLbl: "*📅 Today's agenda*",
    sinEventos: '(no events today)',
    todoElDia: 'all day',
    cumplesLbl: '*Birthdays today*',
    pendientesLbl: '*📝 To-dos*',
    gestionandoLbl: '*🔄 Handling for you*',
    climaMinMax: (min, max) => `, low ${min}° / high ${max}°`,
    climaMax: (max) => `, high ${max}°`,
    probLluvia: (p) => ` · ${p}% chance of rain`,
    recConsultaEnc: (n) => `I owe you a question about ${n === 1 ? 'a pending item' : `${n} pending items`} 👇`,
    recConsultaCierre: 'Let me know what to do with each.',
    recTareaEnc: (n) => `Reminder — ${n === 1 ? 'you have 1 open task' : `you have ${n} open tasks`} 📝`,
    recTareaCierre: 'When you finish one, tell me "done <name>" and I\'ll remove it.',
    recDe: (r) => `from ${r}`,
    cumpleEnc: (plural) => `🎂 *Tomorrow ${plural ? 'these people have' : 'someone has a'} birthday${plural ? 's' : ''}:*`,
    sinWaLibreta: ' (no WhatsApp on file)',
    cumpleCierre: (plural) => `Want me to send ${plural ? 'them' : 'a'} greeting${plural ? 's' : ''} on your behalf? Tell me the tone or send me the text and I'll send it first thing tomorrow. If not, just ignore this.`,
    tuSemana: (d, m) => `📊 *Your week* (as of ${m}/${d})`,
    waLine: (i, o) => `💬 WhatsApp: ${i} received · ${o} sent`,
    mailLine: (i, o) => `📧 Emails: ${i} received · ${o} sent`,
    eventosLine: (n) => `📅 Events scheduled: ${n}`,
    pendLine: (c, n, a) => `📝 To-dos: ${c} closed · ${n} new · ${a} open now`,
    fuLine: (r, d) => `⏳ Follow-ups: ${r} resolved · ${d} triggered`,
    arrancas: '*You start the week with:*',
    enMin: (m) => `⏰ *In ${m}min*:`,
    con: 'With:',
  },
};

function T(idioma) { return M[L(idioma)]; }

module.exports = { T, L, locale, CLIMA_EN };
