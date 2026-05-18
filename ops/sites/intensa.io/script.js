// ─── i18n ────────────────────────────────────────────────────────────────
const translations = {
  es: {
    'title': 'Intensa — Agentes de IA para automatización empresarial',
    'nav.producto': 'Producto',
    'nav.flujo': 'Cómo funciona',
    'nav.casos': 'Casos',
    'nav.cta': 'Hablar con ventas',
    'hero.eyebrow': 'v2.4 · agentes autónomos en producción',
    'hero.h1': 'Agentes de IA que <em>ejecutan trabajo real</em> dentro de tu empresa.',
    'hero.sub': 'Intensa despliega agentes autónomos que se conectan a tus sistemas, razonan sobre tus procesos y completan tareas de principio a fin. Sin chatbots. Sin RPA frágil.',
    'hero.demo': 'Solicitar demo',
    'hero.ver': 'Ver producto',
    'term.l1': '→ conectando a SAP · 1,284 facturas detectadas',
    'term.l2': '→ <span class="term-tag">[razonando]</span> conciliando contra órdenes de compra',
    'term.l3': '→ <span class="term-tag">[acción]</span> 47 discrepancias escaladas · ticket #4821',
    'term.l4': '→ 1,237 facturas aprobadas automáticamente',
    'term.ok': '✓ completado en 4m 12s · ahorro: 38 horas/operador',
    'prod.tag': '// producto',
    'prod.h2': 'Una plataforma. <em>Agentes a medida.</em>',
    'prod.sub': 'Construye, despliega y supervisa agentes de IA especializados para cada proceso. Con observabilidad, control de versiones y trazabilidad de cada decisión.',
    'feat.1.h': 'Razonamiento estructurado',
    'feat.1.p': 'Los agentes operan con planes ejecutables, no respuestas. Cada paso es inspeccionable y reversible.',
    'feat.2.h': 'Conectores empresariales',
    'feat.2.p': 'SAP, Salesforce, NetSuite, HubSpot, Workday y +200 sistemas. Conexión en horas, no semanas.',
    'feat.3.h': 'Human-in-the-loop',
    'feat.3.p': 'Define umbrales de confianza. El agente actúa solo cuando está seguro; escala lo demás a tu equipo.',
    'feat.4.h': 'Observabilidad total',
    'feat.4.p': 'Traces, logs y replays de cada ejecución. Audita decisiones, mide impacto, itera con datos.',
    'feat.5.h': 'Seguridad por diseño',
    'feat.5.p': 'SOC 2 Type II, datos cifrados en reposo y tránsito, despliegue on-premise o VPC dedicada.',
    'feat.6.h': 'SDK abierto',
    'feat.6.p': 'Extiende agentes con código Python o TypeScript. Sin lock-in, sin cajas negras.',
    'flow.tag': '// flujo',
    'flow.h2': 'De problema operativo a <em>agente en producción.</em>',
    'flow.sub': 'Cuatro fases. Sin consultoría interminable. Sin proyectos de 18 meses.',
    'step.1.n': '01 / Mapeo',
    'step.1.h': 'Identificamos el proceso',
    'step.1.p': 'Workshop de 90 minutos para mapear el flujo, datos involucrados y criterios de éxito.',
    'step.2.n': '02 / Conexión',
    'step.2.h': 'Integramos tus sistemas',
    'step.2.p': 'Conectores listos a tu ERP, CRM y herramientas internas. Lectura segura, escritura controlada.',
    'step.3.n': '03 / Despliegue',
    'step.3.h': 'Lanzamos en sombra',
    'step.3.p': 'El agente ejecuta en paralelo a tu equipo durante 2 semanas. Calibramos confianza y precisión.',
    'step.4.n': '04 / Operación',
    'step.4.h': 'Autonomía graduada',
    'step.4.p': 'Pasamos a producción con umbrales que vos controlás. Monitoreo continuo, mejoras semanales.',
    'step.label': 'step 01 / mapeo',
    'vis.1': 'análisis de proceso · cuentas por pagar',
    'vis.2': 'identificando entradas y salidas',
    'vis.3': 'definiendo criterios de éxito',
    'vis.4': 'documentando excepciones',
    'cases.tag': '// casos',
    'cases.h2': 'Procesos donde <em>los agentes ganan</em>.',
    'cases.sub': 'Operaciones repetitivas, intensivas en datos, con reglas claras y excepciones manejables.',
    'case.badge': 'activo',
    'case.1.area': '// finanzas',
    'case.1.h': 'Conciliación de facturas',
    'case.1.p': 'Match automático entre facturas, órdenes de compra y recepciones. Escala discrepancias con contexto.',
    'case.1.m1': 'automatización', 'case.1.m2': 'más rápido',
    'case.2.area': '// ventas',
    'case.2.h': 'Calificación de leads',
    'case.2.p': 'Enriquece, segmenta y asigna leads en tiempo real con datos de CRM, web y fuentes externas.',
    'case.2.m1': 'conversión', 'case.2.m2': 'respuesta',
    'case.3.area': '// operaciones',
    'case.3.h': 'Procesamiento de órdenes',
    'case.3.p': 'Lee emails, PDFs y portales B2B. Crea órdenes en tu ERP, valida stock y notifica al cliente.',
    'case.3.m1': 'sin intervención', 'case.3.m2': '/semana ahorradas',
    'case.4.area': '// soporte',
    'case.4.h': 'Resolución de tickets L1',
    'case.4.p': 'Diagnostica, ejecuta runbooks y resuelve incidentes recurrentes con acceso a tus sistemas internos.',
    'case.4.m1': 'resolución total', 'case.4.m2': 'CSAT',
    'int.tag': '// integraciones',
    'int.h2': 'Vive donde <em>tu trabajo ya vive.</em>',
    'int.sub': '+200 conectores certificados. APIs, webhooks y SDK para lo que falte.',
    'cta.h2': 'Lo que automatizás hoy, <em>se compone solo mañana.</em>',
    'cta.p': 'Agendá una demo de 30 minutos. Te mostramos un agente corriendo sobre datos reales de tu industria.',
    'cta.demo': 'Solicitar demo',
    'cta.wp': 'Leer el whitepaper',
    'footer.tag': 'Agentes de IA para automatización empresarial. Construido para operaciones serias.',
    'footer.prod': 'Producto', 'footer.plat': 'Plataforma', 'footer.como': 'Cómo funciona', 'footer.casos': 'Casos de uso',
    'footer.recursos': 'Recursos', 'footer.docs': 'Documentación', 'footer.sdk': 'SDK', 'footer.changelog': 'Changelog', 'footer.status': 'Status',
    'footer.comp': 'Compañía', 'footer.about': 'Sobre nosotros', 'footer.carreras': 'Carreras', 'footer.seg': 'Seguridad', 'footer.cont': 'Contacto',
    'footer.built': 'built in latam · running globally',
  },
  en: {
    'title': 'Intensa — AI agents for enterprise automation',
    'nav.producto': 'Product',
    'nav.flujo': 'How it works',
    'nav.casos': 'Use cases',
    'nav.cta': 'Talk to sales',
    'hero.eyebrow': 'v2.4 · autonomous agents in production',
    'hero.h1': 'AI agents that <em>get real work done</em> inside your company.',
    'hero.sub': 'Intensa deploys autonomous agents that connect to your systems, reason over your processes, and complete tasks end-to-end. No chatbots. No fragile RPA.',
    'hero.demo': 'Request a demo',
    'hero.ver': 'See the product',
    'term.l1': '→ connecting to SAP · 1,284 invoices detected',
    'term.l2': '→ <span class="term-tag">[reasoning]</span> reconciling against purchase orders',
    'term.l3': '→ <span class="term-tag">[action]</span> 47 discrepancies escalated · ticket #4821',
    'term.l4': '→ 1,237 invoices auto-approved',
    'term.ok': '✓ completed in 4m 12s · savings: 38 operator-hours',
    'prod.tag': '// product',
    'prod.h2': 'One platform. <em>Custom agents.</em>',
    'prod.sub': 'Build, deploy, and supervise specialized AI agents for every process. With observability, version control, and traceability of every decision.',
    'feat.1.h': 'Structured reasoning',
    'feat.1.p': 'Agents operate with executable plans, not answers. Every step is inspectable and reversible.',
    'feat.2.h': 'Enterprise connectors',
    'feat.2.p': 'SAP, Salesforce, NetSuite, HubSpot, Workday and +200 systems. Connect in hours, not weeks.',
    'feat.3.h': 'Human-in-the-loop',
    'feat.3.p': 'Define confidence thresholds. The agent acts only when sure; escalates the rest to your team.',
    'feat.4.h': 'Full observability',
    'feat.4.p': 'Traces, logs and replays for every execution. Audit decisions, measure impact, iterate with data.',
    'feat.5.h': 'Security by design',
    'feat.5.p': 'SOC 2 Type II, data encrypted at rest and in transit, on-premise or dedicated VPC deployment.',
    'feat.6.h': 'Open SDK',
    'feat.6.p': 'Extend agents with Python or TypeScript code. No lock-in, no black boxes.',
    'flow.tag': '// flow',
    'flow.h2': 'From operational problem to <em>agent in production.</em>',
    'flow.sub': 'Four phases. No endless consulting. No 18-month projects.',
    'step.1.n': '01 / Mapping',
    'step.1.h': 'We identify the process',
    'step.1.p': '90-minute workshop to map the flow, data involved, and success criteria.',
    'step.2.n': '02 / Connection',
    'step.2.h': 'We integrate your systems',
    'step.2.p': 'Ready connectors to your ERP, CRM, and internal tools. Secure read, controlled write.',
    'step.3.n': '03 / Deployment',
    'step.3.h': 'We launch in shadow mode',
    'step.3.p': 'The agent runs in parallel with your team for 2 weeks. We calibrate confidence and accuracy.',
    'step.4.n': '04 / Operation',
    'step.4.h': 'Graduated autonomy',
    'step.4.p': 'We move to production with thresholds you control. Continuous monitoring, weekly improvements.',
    'step.label': 'step 01 / mapping',
    'vis.1': 'process analysis · accounts payable',
    'vis.2': 'identifying inputs and outputs',
    'vis.3': 'defining success criteria',
    'vis.4': 'documenting exceptions',
    'cases.tag': '// use cases',
    'cases.h2': 'Where <em>agents win</em>.',
    'cases.sub': 'Repetitive, data-intensive operations with clear rules and manageable exceptions.',
    'case.badge': 'active',
    'case.1.area': '// finance',
    'case.1.h': 'Invoice reconciliation',
    'case.1.p': 'Automatic matching between invoices, purchase orders, and receipts. Escalates discrepancies with context.',
    'case.1.m1': 'automation', 'case.1.m2': 'faster',
    'case.2.area': '// sales',
    'case.2.h': 'Lead qualification',
    'case.2.p': 'Enrich, segment, and assign leads in real time with CRM, web, and external data sources.',
    'case.2.m1': 'conversion', 'case.2.m2': 'response',
    'case.3.area': '// operations',
    'case.3.h': 'Order processing',
    'case.3.p': 'Reads emails, PDFs, and B2B portals. Creates orders in your ERP, validates stock, notifies the customer.',
    'case.3.m1': 'hands-off', 'case.3.m2': 'hrs/week saved',
    'case.4.area': '// support',
    'case.4.h': 'L1 ticket resolution',
    'case.4.p': 'Diagnoses, runs runbooks, and resolves recurring incidents with access to your internal systems.',
    'case.4.m1': 'full resolution', 'case.4.m2': 'CSAT',
    'int.tag': '// integrations',
    'int.h2': 'Lives where <em>your work already lives.</em>',
    'int.sub': '+200 certified connectors. APIs, webhooks, and SDK for everything else.',
    'cta.h2': 'What you automate today <em>compounds on its own tomorrow.</em>',
    'cta.p': 'Schedule a 30-minute demo. We’ll show you an agent running on real data from your industry.',
    'cta.demo': 'Request a demo',
    'cta.wp': 'Read the whitepaper',
    'footer.tag': 'AI agents for enterprise automation. Built for serious operations.',
    'footer.prod': 'Product', 'footer.plat': 'Platform', 'footer.como': 'How it works', 'footer.casos': 'Use cases',
    'footer.recursos': 'Resources', 'footer.docs': 'Documentation', 'footer.sdk': 'SDK', 'footer.changelog': 'Changelog', 'footer.status': 'Status',
    'footer.comp': 'Company', 'footer.about': 'About us', 'footer.carreras': 'Careers', 'footer.seg': 'Security', 'footer.cont': 'Contact',
    'footer.built': 'built in latam · running globally',
  }
};

// Step data (textos del step animation también en ambos idiomas)
const stepDataByLang = {
  es: {
    1: { label: 'step 01 / mapeo', nodes: [
      ['active', 'análisis de proceso · cuentas por pagar'],
      ['pending', 'identificando entradas y salidas'],
      ['idle', 'definiendo criterios de éxito'],
      ['idle', 'documentando excepciones']
    ]},
    2: { label: 'step 02 / conexión', nodes: [
      ['active', 'SAP S/4HANA · oauth conectado'],
      ['active', 'permisos de lectura · ok'],
      ['pending', 'salesforce · sandbox sync'],
      ['idle', 'gmail api · pendiente de aprobación']
    ]},
    3: { label: 'step 03 / despliegue', nodes: [
      ['active', 'shadow mode · 247 ejecuciones'],
      ['active', 'precisión vs humano: 96.4%'],
      ['pending', 'calibrando umbrales de confianza'],
      ['idle', 'reporte semanal listo · viernes']
    ]},
    4: { label: 'step 04 / operación', nodes: [
      ['active', 'producción · 14d en vivo'],
      ['active', '4,812 ejecuciones · 99.2% éxito'],
      ['active', 'ahorro acumulado: 312h'],
      ['pending', 'mejora en cola · v2.1']
    ]}
  },
  en: {
    1: { label: 'step 01 / mapping', nodes: [
      ['active', 'process analysis · accounts payable'],
      ['pending', 'identifying inputs and outputs'],
      ['idle', 'defining success criteria'],
      ['idle', 'documenting exceptions']
    ]},
    2: { label: 'step 02 / connection', nodes: [
      ['active', 'SAP S/4HANA · oauth connected'],
      ['active', 'read permissions · ok'],
      ['pending', 'salesforce · sandbox sync'],
      ['idle', 'gmail api · pending approval']
    ]},
    3: { label: 'step 03 / deployment', nodes: [
      ['active', 'shadow mode · 247 runs'],
      ['active', 'accuracy vs human: 96.4%'],
      ['pending', 'calibrating confidence thresholds'],
      ['idle', 'weekly report ready · friday']
    ]},
    4: { label: 'step 04 / operation', nodes: [
      ['active', 'production · 14d live'],
      ['active', '4,812 runs · 99.2% success'],
      ['active', 'total savings: 312h'],
      ['pending', 'improvement queued · v2.1']
    ]}
  }
};

let currentLang = localStorage.getItem('intensa-lang') || (navigator.language && navigator.language.startsWith('en') ? 'en' : 'es');
let currentStep = 1;

function applyTranslations(lang) {
  const t = translations[lang];
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    if (t[key] !== undefined) el.textContent = t[key];
  });
  document.querySelectorAll('[data-i18n-html]').forEach(el => {
    const key = el.dataset.i18nHtml;
    if (t[key] !== undefined) el.innerHTML = t[key];
  });
  if (t['title']) document.title = t['title'];
  document.documentElement.lang = lang;
  // Step visual: re-render con textos del idioma actual
  renderStep(currentStep, lang);
  // Update flag visibility
  document.querySelectorAll('.lang-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.lang === lang);
  });
}

function renderStep(stepNum, lang) {
  const stepLabel = document.getElementById('stepLabel');
  const visualContent = document.getElementById('visualContent');
  if (!stepLabel || !visualContent) return;
  const data = stepDataByLang[lang][stepNum];
  if (!data) return;
  stepLabel.textContent = data.label;
  visualContent.innerHTML = data.nodes.map((n, i) => `
    <div class="visual-node"><span class="status ${n[0] === 'active' ? '' : n[0]}"></span> ${n[1]}</div>
    ${i < data.nodes.length - 1 ? '<div class="visual-arrow"></div>' : ''}
  `).join('');
}

// Inicializar
document.addEventListener('DOMContentLoaded', () => {
  applyTranslations(currentLang);

  // Language buttons: cada uno setea el idioma específico (no flip)
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const lang = btn.dataset.lang;
      if (lang === currentLang) return;
      currentLang = lang;
      localStorage.setItem('intensa-lang', currentLang);
      applyTranslations(currentLang);
    });
  });

  // Step interaction
  const steps = document.querySelectorAll('.step');
  steps.forEach(step => {
    step.addEventListener('click', () => {
      steps.forEach(s => s.classList.remove('active'));
      step.classList.add('active');
      currentStep = parseInt(step.dataset.step, 10);
      renderStep(currentStep, currentLang);
    });
  });

  // Auto-cycle
  setInterval(() => {
    currentStep = (currentStep % 4) + 1;
    document.querySelector(`.step[data-step="${currentStep}"]`).click();
  }, 4500);

  // Reveal on scroll
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) entry.target.classList.add('visible');
    });
  }, { threshold: 0.1 });
  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
});
