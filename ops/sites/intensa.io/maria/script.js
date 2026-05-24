// ─── i18n ────────────────────────────────────────────────────────────────
const translations = {
  es: {
    'title': 'Maria — Tu secretaria personal con IA, 24/7 por WhatsApp',
    'meta.desc': 'Maria agenda reuniones, coordina con terceros por su propia cuenta, gestiona pendientes y te responde por WhatsApp. Sin app que instalar, sin curva de aprendizaje.',
    'nav.que': 'Qué hace', 'nav.casos': 'Para quién', 'nav.planes': 'Planes', 'nav.cta': 'Suscribirme',
    'hero.eyebrow': 'Secretaria personal con IA · disponible 24/7',
    'hero.h1': 'Tenés más cosas para hacer que tiempo. <em>Maria se ocupa.</em>',
    'hero.sub': 'Le escribís por WhatsApp como a cualquier persona. Ella agenda, contacta a tus terceros por mail o WhatsApp desde su propia cuenta, te recuerda lo que te olvidás y maneja tu día. Sin app que instalar.',
    'hero.ver-planes': 'Ver planes', 'hero.como': 'Cómo funciona',
    'chat.1': 'Maria, agendame con Carla el jueves a las 3, mandale invite',
    'chat.2': 'Listo. Reunión con Carla el jueves 22 de mayo a las 15:00. Le mandé invite a su email con link de Meet. Te dejo aviso 15min antes.',
    'chat.3': 'y mañana a las 9 recordame de llamar al contador',
    'chat.4': 'Anotado, te aviso mañana 9am.',
    'que.h2': 'Una persona menos en tu cabeza. <em>Todo lo que ella hace por vos.</em>',
    'que.sub': 'Maria conecta con tu calendar y tus contactos. Tiene su propia cuenta de mail desde la que coordina con tus terceros. Le hablás como a una persona y ella ejecuta.',
    'feat.1.h': 'Tu agenda',
    'feat.1.p': 'Agendar, mover y cancelar reuniones. Avisos 15min antes. Brief matutino con tu día. Funciona con Google Calendar, iCloud, Outlook, Yahoo.',
    'feat.2.h': 'Coordinación con terceros',
    'feat.2.p': '"Coordiná un café con Juan la próxima semana" — Maria habla con Juan, propone horarios, agenda y te avisa cuando está confirmado.',
    'feat.3.h': 'Pendientes y recordatorios',
    'feat.3.p': '"Recordame el martes pagar al contador". "Si Juan no me responde en 3 días, avisame". Maria te lo cuida.',
    'feat.4.h': 'Audios, PDFs, contactos',
    'feat.4.p': 'Le mandás un audio — lo transcribe. Una factura en PDF — la lee. La tarjeta de un contacto — la guarda en libreta.',
    'feat.5.h': 'Maria escribe por vos',
    'feat.5.p': '"Mandale a Mariana el contrato y agendá llamada de seguimiento". Maria le escribe a Mariana desde su propia cuenta de mail, te deja en copia y agenda. Nunca toca tu inbox.',
    'feat.6.h': 'Multi-idioma nativo',
    'feat.6.p': 'Le hablás en castellano, contacta a un proveedor en inglés. Maria habla los dos sin que tengas que pedirlo.',
    'casos.h2': '¿Para quién es <em>Maria</em>?',
    'casos.sub': 'Si tu día arranca con 47 mensajes sin contestar, llegaste al lugar correcto.',
    'caso.1.h': 'Profesional independiente',
    'caso.1.p': 'Consultores, abogados, médicos, terapeutas. Manejar tu agenda + coordinar con clientes + recordatorios sin tener que pensar.',
    'caso.2.h': 'Founder / Emprendedor',
    'caso.2.p': 'Tu equipo, tus inversores, tus reuniones. Que alguien se ocupe del calendar y las gestiones mientras vos hacés lo importante.',
    'caso.3.h': 'Persona ocupada',
    'caso.3.p': 'Familia, hobbies, viajes, trámites. La cabeza llena de cosas chiquitas que olvidás. Maria es tu memoria externa.',
    'dif.h2': 'No es un chatbot. <em>Es un asistente que ejecuta.</em>',
    'dif.1.t': 'Chatbots tradicionales',
    'dif.1.p': 'Te responden cosas que ya podías googlear. Te leen lo que está en tu agenda.',
    'dif.2.t': 'Maria',
    'dif.2.p': 'Agenda eventos, contacta a tus terceros por mail o WhatsApp desde su propia cuenta, te recuerda lo que pediste. Hace, no solo dice.',
    'dif.3.t': 'Apps de productividad',
    'dif.3.p': 'Otra app más para abrir. Otra interfaz que aprender. Otro lugar donde olvidás cosas.',
    'dif.4.t': 'Maria',
    'dif.4.p': 'Vive donde vos ya vivís: WhatsApp. Cero app, cero login, cero curva de aprendizaje.',
    'planes.h2': 'Un plan. <em>Todo incluido.</em>',
    'planes.sub': 'Sin permanencia. Cancelás cuando quieras.',
    'plan.period': '/mes',
    'plan.1.name': 'Maria',
    'plan.1.desc': 'Tu secretaria personal con IA, disponible 24/7 por WhatsApp. Sin curva de aprendizaje.',
    'plan.1.f1': 'Agenda integrada (Google · iCloud · Outlook)',
    'plan.1.f2': 'Coordinación con terceros por mail y WhatsApp',
    'plan.1.f3': 'Maria escribe en tu nombre desde su propia cuenta',
    'plan.1.f4': 'Audios, PDFs, imágenes y contactos',
    'plan.1.f5': 'Brief matutino + recordatorios + follow-ups',
    'plan.1.f6': 'Memoria de largo plazo curada por contacto',
    'plan.1.f7': 'Multi-idioma nativo',
    'plan.1.f8': 'Soporte por WhatsApp',
    'plan.cta': 'Suscribirme →',
    'plan.ya-cliente': '¿Ya sos cliente? Tu cuenta →',
    'planes.nota': '¿Necesitás algo a medida — equipo grande, deploy on-premise, integraciones específicas? <a href="mailto:hola@intensa.io" data-i18n="planes.nota-link">Escribinos</a>.',
    'planes.nota-link': 'Escribinos',
    'faq.h2': 'Preguntas frecuentes',
    'faq.1.q': '¿Cómo funciona el primer día?',
    'faq.1.a': 'Apenas te suscribís, te llega un WhatsApp de Maria presentándose. Te pide tu email y qué calendar usás, te guía para conectar la integración (1-2 minutos), y a partir de ahí ya podés hablarle de cualquier cosa.',
    'faq.2.q': '¿Es seguro? ¿Quién ve mis datos?',
    'faq.2.a': 'Tus credenciales de calendar viven cifradas (AES-256). Maria solo lee/escribe en TU calendar, nadie más. Tus mensajes de WhatsApp no se exponen a otros usuarios. Auditamos cada acción que ejecuta.',
    'faq.3.q': '¿Puede mandar mensajes en mi nombre sin que yo confirme?',
    'faq.3.a': 'Para coordinar con terceros (escribir a Juan para agendar reunión), sí — esa es la idea. Pero antes de cualquier acción "fuerte" (cancelar reunión grande, mandar email a alguien nuevo, etc.) te pide confirmación. Vos controlás el umbral.',
    'faq.4.q': '¿Funciona con Outlook / iCloud / Yahoo?',
    'faq.4.a': 'Sí. Google Calendar (Gmail/Workspace), Microsoft (Outlook/Office 365), iCloud, Yahoo, Fastmail. Para los no-Google necesitamos un app-password de tu cuenta solo para acceder al calendar (no a tu mail) — el setup lo guía Maria en el chat.',
    'faq.5.q': '¿Puedo cancelar?',
    'faq.5.a': 'Cuando quieras. Sin permanencia, sin cargos ocultos. Cancelás desde tu panel de cliente y dejás de pagar al ciclo siguiente.',
    'faq.6.q': '¿Maria aprende con el tiempo?',
    'faq.6.a': 'Sí. Construye memoria de largo plazo sobre quién es quién en tu vida, qué preferencias tenés ("no me agendes nada antes de las 10"), qué follow-ups soltaste, etc. Cuanto más la usás, más se afina.',
    'faq.7.q': '¿Qué tipo de cosas le puedo pedir? Dame ejemplos',
    'faq.7.a': 'Le hablás en lenguaje natural, como a cualquier persona. Algunos ejemplos de lo que le podés pedir:',
    'faq.7.e1': '<strong>Agenda:</strong> "Agendá una reunión con Carla el jueves a las 3 y mandale el invite" · "¿Qué tengo mañana?" · "Pasá la de las 4 a las 6"',
    'faq.7.e2': '<strong>Coordinar con terceros:</strong> "Coordiná un café con Juan la semana que viene" · "Preguntale a María si le sirve el martes 10am"',
    'faq.7.e3': '<strong>Recordatorios y pendientes:</strong> "Recordame el martes pagar al contador" · "Si el proveedor no contesta en 3 días, avisame"',
    'faq.7.e4': '<strong>Mails:</strong> "Mandale el contrato a Mariana y agendá una llamada de seguimiento" — Maria escribe desde su propia cuenta y te deja en copia',
    'faq.7.e5': '<strong>Archivos:</strong> mandale un audio y lo transcribe, una factura en PDF y la lee, la tarjeta de un contacto y la guarda en tu libreta',
    'faq.7.e6': '<strong>Tu día:</strong> "Pasame el brief de hoy" · "¿Cuál era la dirección de la oficina?" — Maria recuerda lo que le contaste',
    'faq.8.q': '¿Tengo que usar comandos o palabras clave?',
    'faq.8.a': 'No. Le escribís en lenguaje natural, como a cualquier contacto de WhatsApp — sin comandos, sin botones, sin formato especial. Le podés mandar texto, audios, imágenes, PDFs o contactos. Si algo no le queda claro, te pregunta antes de hacerlo.',
    'faq.9.q': '¿En qué horario tengo soporte?',
    'faq.9.a': 'Maria, como asistente, está disponible 24/7 — le escribís a cualquier hora y te responde. El equipo de soporte humano (temas de cuenta, facturación o si algo no funciona) atiende de lunes a viernes de 9 a 18 h, hora de Argentina. Escribinos a <a href="mailto:hola@intensa.io">hola@intensa.io</a> y te respondemos dentro de ese horario.',
    'caps.h2': 'Maria, dimensionada para vos. <em>Sin sorpresas.</em>',
    'caps.sub': 'Estos son los números cómodos para una persona en su día a día. Con margen para días intensos.',
    'caps.1': 'contactos en tu libreta personal',
    'caps.2': 'mensajes que Maria envía en tu nombre por día',
    'caps.3': 'pendientes abiertos en simultáneo',
    'caps.4': 'conversación con Maria, sin tope diario',
    'caps.5': 'audios, imágenes, PDFs y vCards (sin límite duro)',
    'caps.6': 'por respuesta — Maria razona cada turno, no responde con plantillas',
    'caps.integ.h': 'Calendarios soportados',
    'caps.stable': 'Estable',
    'caps.beta': 'Beta',
    'caps.integ.google': 'Google Calendar (Gmail / Workspace)',
    'caps.integ.ms': 'Microsoft Outlook / Office 365',
    'caps.integ.caldav': 'iCloud · Fastmail · Yahoo (CalDAV)',
    'caps.no.h': 'Lo que Maria no hace todavía',
    'caps.no.1': 'No tiene panel web — toda la operación es por WhatsApp.',
    'caps.no.2': 'No lee tu inbox personal — opera desde su propia cuenta de mail.',
    'caps.no.3': 'No procesa pagos ni acciones financieras.',
    'caps.priv': 'Tu agenda, tus mensajes y tu libreta son <strong>solo tuyos</strong>. Otros usuarios de Maria nunca ven tu información, y tu data nunca se usa para entrenar modelos.',
    'footer.caps': 'Capacidades',
    'cta.h2': 'Empezá hoy. <em>Maria está lista cuando vos.</em>',
    'cta.p': 'Setup en 2 minutos. Sin app, sin tarjeta de crédito atada — cancelás cuando quieras.',
    'cta.elegir': 'Elegir mi plan',
    'cta.preguntar': 'Tengo una pregunta',
    'footer.tag': 'Tu secretaria personal con IA. Por intensa labs.',
    'footer.prod': 'Producto', 'footer.que': 'Qué hace', 'footer.casos': 'Para quién', 'footer.planes': 'Planes',
    'footer.legal': 'Legal', 'footer.terms': 'Términos', 'footer.priv': 'Privacidad', 'footer.refunds': 'Reembolsos',
    'footer.contacto': 'Contacto',
    'footer.built': 'made with care · running in latam',
  },
  en: {
    'title': 'Maria — Your AI personal assistant, 24/7 on WhatsApp',
    'meta.desc': 'Maria books meetings, coordinates with third parties from her own account, manages to-dos and replies via WhatsApp. No app to install, no learning curve.',
    'nav.que': 'What it does', 'nav.casos': 'Who it\'s for', 'nav.planes': 'Plans', 'nav.cta': 'Subscribe',
    'hero.eyebrow': 'AI personal assistant · available 24/7',
    'hero.h1': 'More to do than hours in the day. <em>Maria handles it.</em>',
    'hero.sub': 'Talk to her on WhatsApp like to anyone. She books meetings, reaches out to your contacts by email or WhatsApp from her own account, reminds you what you forgot and runs your day. No app to install.',
    'hero.ver-planes': 'See plans', 'hero.como': 'How it works',
    'chat.1': 'Maria, book Carla for Thursday at 3pm, send her an invite',
    'chat.2': 'Done. Meeting with Carla on Thursday May 22 at 3pm. Sent the invite to her email with a Meet link. I\'ll remind you 15min before.',
    'chat.3': 'and tomorrow at 9 remind me to call my accountant',
    'chat.4': 'Got it, I\'ll ping you at 9am tomorrow.',
    'que.h2': 'One less person in your head. <em>Everything she does for you.</em>',
    'que.sub': 'Maria connects to your calendar and your contacts. She has her own email account from which she coordinates with your third parties. Talk to her like to a person and she executes.',
    'feat.1.h': 'Your calendar',
    'feat.1.p': 'Book, move and cancel meetings. 15-min advance pings. Morning brief with your day. Works with Google Calendar, iCloud, Outlook, Yahoo.',
    'feat.2.h': 'Coordination with third parties',
    'feat.2.p': '"Set up coffee with Juan next week" — Maria reaches out, proposes times, books and lets you know once confirmed.',
    'feat.3.h': 'To-dos and reminders',
    'feat.3.p': '"Tuesday remind me to pay the accountant". "If Juan doesn\'t reply in 3 days, ping me". Maria takes care of it.',
    'feat.4.h': 'Audios, PDFs, contacts',
    'feat.4.p': 'Send her an audio — she transcribes it. A PDF invoice — she reads it. A contact card — she saves it.',
    'feat.5.h': 'Maria writes for you',
    'feat.5.p': '"Send Mariana the contract and book a follow-up call". Maria emails Mariana from her own account, CCs you and schedules. She never touches your inbox.',
    'feat.6.h': 'Native multi-language',
    'feat.6.p': 'You speak Spanish, she reaches out to a vendor in English. Maria switches languages on her own.',
    'casos.h2': 'Who is <em>Maria</em> for?',
    'casos.sub': 'If your day starts with 47 unread messages, you\'re in the right place.',
    'caso.1.h': 'Independent professional',
    'caso.1.p': 'Consultants, lawyers, doctors, therapists. Handle your calendar + coordinate with clients + reminders without thinking.',
    'caso.2.h': 'Founder / Entrepreneur',
    'caso.2.p': 'Your team, your investors, your meetings. Someone takes the calendar and errands off your plate while you do the real work.',
    'caso.3.h': 'Busy person',
    'caso.3.p': 'Family, hobbies, trips, errands. Head full of tiny things you forget. Maria is your external memory.',
    'dif.h2': 'Not a chatbot. <em>An assistant that executes.</em>',
    'dif.1.t': 'Traditional chatbots',
    'dif.1.p': 'They reply with stuff you could have Googled. They read out what\'s already in your calendar.',
    'dif.2.t': 'Maria',
    'dif.2.p': 'Books events, reaches out to your third parties by email or WhatsApp from her own account, reminds you what you asked. She does, not just says.',
    'dif.3.t': 'Productivity apps',
    'dif.3.p': 'One more app to open. One more UI to learn. One more place to forget things.',
    'dif.4.t': 'Maria',
    'dif.4.p': 'Lives where you already live: WhatsApp. Zero app, zero login, zero learning curve.',
    'planes.h2': 'One plan. <em>Everything included.</em>',
    'planes.sub': 'No lock-in. Cancel anytime.',
    'plan.period': '/mo',
    'plan.1.name': 'Maria',
    'plan.1.desc': 'Your AI personal assistant, available 24/7 over WhatsApp. No learning curve.',
    'plan.1.f1': 'Integrated calendar (Google · iCloud · Outlook)',
    'plan.1.f2': 'Coordination with third parties by email and WhatsApp',
    'plan.1.f3': 'Maria writes on your behalf from her own account',
    'plan.1.f4': 'Audios, PDFs, images and contacts',
    'plan.1.f5': 'Morning brief + reminders + follow-ups',
    'plan.1.f6': 'Curated long-term memory per contact',
    'plan.1.f7': 'Native multi-language',
    'plan.1.f8': 'WhatsApp support',
    'plan.cta': 'Subscribe →',
    'plan.ya-cliente': 'Already a customer? Your account →',
    'planes.nota': 'Need something custom \u2014 larger team, on-premise deploy, specific integrations? <a href="mailto:hola@intensa.io" data-i18n="planes.nota-link">Write us</a>.',
    'planes.nota-link': 'Write us',
    'faq.h2': 'Frequently asked',
    'faq.1.q': 'How does the first day work?',
    'faq.1.a': 'As soon as you subscribe, you get a WhatsApp from Maria introducing herself. She asks for your email and which calendar you use, walks you through the integration (1-2 minutes), and from there you can talk to her about anything.',
    'faq.2.q': 'Is it secure? Who sees my data?',
    'faq.2.a': 'Your calendar credentials live encrypted (AES-256). Maria only reads/writes in YOUR calendar, no one else\'s. Your WhatsApp messages aren\'t exposed to other users. We audit every action she executes.',
    'faq.3.q': 'Can she send messages on my behalf without my confirmation?',
    'faq.3.a': 'For coordinating with third parties (writing to Juan to book a meeting), yes — that\'s the point. But before any "strong" action (cancel a big meeting, email someone new, etc.) she asks for confirmation. You control the threshold.',
    'faq.4.q': 'Does it work with Outlook / iCloud / Yahoo?',
    'faq.4.a': 'Yes. Google Calendar (Gmail/Workspace), Microsoft (Outlook/Office 365), iCloud, Yahoo, Fastmail. For non-Google providers we need an app-password from your account just to access the calendar (not your email) — Maria walks you through the setup in chat.',
    'faq.5.q': 'Can I cancel?',
    'faq.5.a': 'Anytime. No lock-in, no hidden fees. Cancel from your customer portal and stop paying from the next cycle.',
    'faq.6.q': 'Does Maria learn over time?',
    'faq.6.a': 'Yes. She builds long-term memory about who\'s who in your life, what preferences you have ("don\'t book me anything before 10"), what follow-ups you\'ve dropped, etc. The more you use her, the sharper she gets.',
    'faq.7.q': 'What kind of things can I ask her? Give me examples',
    'faq.7.a': 'You talk to her in plain language, like to anyone. Some examples of what you can ask:',
    'faq.7.e1': '<strong>Calendar:</strong> "Book a meeting with Carla Thursday at 3 and send her the invite" · "What do I have tomorrow?" · "Move the 4pm one to 6"',
    'faq.7.e2': '<strong>Coordinating with others:</strong> "Set up coffee with Juan next week" · "Ask María if Tuesday 10am works for her"',
    'faq.7.e3': '<strong>Reminders and to-dos:</strong> "Remind me Tuesday to pay the accountant" · "If the vendor doesn\'t reply in 3 days, ping me"',
    'faq.7.e4': '<strong>Emails:</strong> "Send Mariana the contract and book a follow-up call" — Maria writes from her own account and CCs you',
    'faq.7.e5': '<strong>Files:</strong> send her an audio and she transcribes it, a PDF invoice and she reads it, a contact card and she saves it to your address book',
    'faq.7.e6': '<strong>Your day:</strong> "Give me today\'s brief" · "What was the office address again?" — Maria remembers what you told her',
    'faq.8.q': 'Do I have to use commands or keywords?',
    'faq.8.a': 'No. You write to her in plain language, like to any WhatsApp contact — no commands, no buttons, no special format. You can send text, audios, images, PDFs or contacts. If something isn\'t clear, she asks before doing it.',
    'faq.9.q': 'What are the support hours?',
    'faq.9.a': 'Maria, as an assistant, is available 24/7 — message her any time and she replies. The human support team (account, billing, or if something isn\'t working) is available Monday to Friday, 9am to 6pm, Argentina time. Write to us at <a href="mailto:hola@intensa.io">hola@intensa.io</a> and we\'ll get back to you within those hours.',
    'caps.h2': 'Maria, built to your scale. <em>No surprises.</em>',
    'caps.sub': 'These are the comfortable numbers for one person in their day to day. With headroom for busy days.',
    'caps.1': 'contacts in your personal address book',
    'caps.2': 'messages Maria sends on your behalf per day',
    'caps.3': 'open to-dos at once',
    'caps.4': 'conversation with Maria, no daily cap',
    'caps.5': 'audios, images, PDFs and vCards (no hard limit)',
    'caps.6': 'per reply — Maria reasons every turn, not templated answers',
    'caps.integ.h': 'Supported calendars',
    'caps.stable': 'Stable',
    'caps.beta': 'Beta',
    'caps.integ.google': 'Google Calendar (Gmail / Workspace)',
    'caps.integ.ms': 'Microsoft Outlook / Office 365',
    'caps.integ.caldav': 'iCloud · Fastmail · Yahoo (CalDAV)',
    'caps.no.h': 'What Maria doesn\'t do yet',
    'caps.no.1': 'No web dashboard — everything is over WhatsApp.',
    'caps.no.2': 'Doesn\'t read your personal inbox — operates from her own email account.',
    'caps.no.3': 'No payments or financial actions.',
    'caps.priv': 'Your calendar, your messages and your contacts are <strong>yours only</strong>. Other Maria users never see your info, and your data is never used to train models.',
    'footer.caps': 'Capabilities',
    'cta.h2': 'Start today. <em>Maria is ready when you are.</em>',
    'cta.p': '2-minute setup. No app, no credit card lock-in — cancel anytime.',
    'cta.elegir': 'Pick my plan',
    'cta.preguntar': 'I have a question',
    'footer.tag': 'Your AI personal assistant. By intensa labs.',
    'footer.prod': 'Product', 'footer.que': 'What it does', 'footer.casos': 'Who it\'s for', 'footer.planes': 'Plans',
    'footer.legal': 'Legal', 'footer.terms': 'Terms', 'footer.priv': 'Privacy', 'footer.refunds': 'Refunds',
    'footer.contacto': 'Contact',
    'footer.built': 'made with care · running in latam',
  }
};

let currentLang = localStorage.getItem('maria-lang') || (navigator.language && navigator.language.startsWith('en') ? 'en' : 'es');

function applyTranslations(lang) {
  const t = translations[lang];
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    if (t[key] !== undefined) {
      if (el.tagName === 'META') el.setAttribute('content', t[key]);
      else el.textContent = t[key];
    }
  });
  document.querySelectorAll('[data-i18n-html]').forEach(el => {
    const key = el.dataset.i18nHtml;
    if (t[key] !== undefined) el.innerHTML = t[key];
  });
  if (t['title']) document.title = t['title'];
  document.documentElement.lang = lang;
  document.querySelectorAll('.lang-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.lang === lang);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  applyTranslations(currentLang);

  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const lang = btn.dataset.lang;
      if (lang === currentLang) return;
      currentLang = lang;
      localStorage.setItem('maria-lang', currentLang);
      applyTranslations(currentLang);
    });
  });

  // Lemon Squeezy checkout handler — los CTAs con data-lemon-product van
  // a abrir el Lemon checkout cuando Diego pase los Product IDs.
  // Por ahora, scrollean al final o muestran un alert temporal.
  document.querySelectorAll('[data-lemon-product]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const product = btn.dataset.lemonProduct;
      // TODO: reemplazar con Lemon.js cuando esté el store:
      //   window.LemonSqueezy.Url.Open(`https://YOURSTORE.lemonsqueezy.com/buy/PRODUCT_${product}_ID`);
      window.location.href = `mailto:hola@intensa.io?subject=Plan ${product} de Maria&body=Hola, me gustaría suscribirme al plan ${product}.`;
    });
  });

  // Reveal on scroll
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) entry.target.classList.add('visible');
    });
  }, { threshold: 0.1 });
  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
});
