// signup/script.js — flow signup en 3 steps con API /maria/api/signup

const API = '/maria/api/signup';
let signupId = null;

const TR = {
  es: {
    'title': 'Suscribirme — María',
    'meta.desc': 'Suscribite a María. Validamos tu email y WhatsApp con un código antes de cobrar.',
    'nav.atras': '← Volver',
    'step1.h1': 'Suscribirme a <em>María</em>.',
    'step1.sub': 'Primero te validamos por email y WhatsApp. Después pagás. USD 49.99/mes. Cancelás cuando quieras.',
    'step1.lbl-nombre': 'Tu nombre',
    'step1.lbl-email': 'Email',
    'step1.lbl-wa': 'WhatsApp (con código de país)',
    'step1.hint-wa': 'Te vamos a mandar un código por WhatsApp — asegurate de que sea el correcto.',
    'step1.cta': 'Continuar',
    'step1.lbl-terminos': 'Acepto los <a href="/maria/terminos/" target="_blank">Términos y Condiciones</a>.',
    'err.must_accept_terms': 'Tenés que aceptar los Términos y Condiciones para continuar.',
    'err.captcha_required': 'Completá el captcha.',
    'step1.legal': 'Al continuar aceptás recibir mensajes de María por WhatsApp y email para validar tu identidad. No spam.',
    'step2.h1': 'Validá los dos códigos.',
    'step2.sub': 'Te mandamos uno a tu <em>email</em> y otro a tu <em>WhatsApp</em>. Ingresalos abajo. Vencen en 10 minutos.',
    'step2.lbl-email-code': 'Código de email',
    'step2.lbl-wa-code': 'Código de WhatsApp',
    'step2.cta': 'Ir a pagar',
    'step2.reenviar': '¿No te llegaron? Reenviar',
    'step2.volver': 'Corregir datos',
    'step3.h1': 'Casi listo. <em>Te llevamos al checkout.</em>',
    'step3.sub': 'En 3 segundos te redirigimos al checkout seguro de Stripe para finalizar el pago.',
    'step3.cta': 'Ir al checkout ahora',
    'err.generic': 'Algo falló. Probá de nuevo en un momento.',
    'err.bad_nombre': 'Ingresá tu nombre completo.',
    'err.bad_email': 'Email inválido.',
    'err.bad_wa': 'WhatsApp inválido. Usá formato internacional con código de país.',
    'err.bad_provider': 'Elegí un proveedor de calendario.',
    'err.already_active': 'Ya hay una suscripción activa con este email o WhatsApp.',
    'err.signup_expired': 'La sesión expiró. Reiniciá el proceso.',
    'err.email_max_intentos': 'Demasiados intentos con el código de email. Reiniciá.',
    'err.wa_max_intentos': 'Demasiados intentos con el código de WhatsApp. Reiniciá.',
    'msg.codes_sent': 'Códigos enviados a tu email y WhatsApp. Vencen en 10 minutos.',
    'msg.codes_partial': 'Los códigos no coinciden. Revisá ambos.',
    'msg.reenviado': 'Códigos reenviados.',
  },
  en: {
    'title': 'Subscribe — María',
    'meta.desc': 'Subscribe to María. We verify your email and WhatsApp with a code before charging.',
    'nav.atras': '← Back',
    'step1.h1': 'Subscribe to <em>María</em>.',
    'step1.sub': 'First we verify your email and WhatsApp. Then you pay. USD 49.99/mo. Cancel anytime.',
    'step1.lbl-nombre': 'Your name',
    'step1.lbl-email': 'Email',
    'step1.lbl-wa': 'WhatsApp (with country code)',
    'step1.hint-wa': 'We will send you a code via WhatsApp — make sure it\'s correct.',
    'step1.cta': 'Continue',
    'step1.lbl-terminos': 'I accept the <a href="/maria/terminos/" target="_blank">Terms and Conditions</a>.',
    'err.must_accept_terms': 'You must accept the Terms and Conditions to continue.',
    'err.captcha_required': 'Complete the captcha.',
    'step1.legal': 'By continuing you agree to receive messages from María via WhatsApp and email to verify your identity. No spam.',
    'step2.h1': 'Verify both codes.',
    'step2.sub': 'We sent one to your <em>email</em> and another to your <em>WhatsApp</em>. Enter both. They expire in 10 minutes.',
    'step2.lbl-email-code': 'Email code',
    'step2.lbl-wa-code': 'WhatsApp code',
    'step2.cta': 'Go to checkout',
    'step2.reenviar': 'Didn\'t arrive? Resend',
    'step2.volver': 'Fix data',
    'step3.h1': 'Almost done. <em>Taking you to checkout.</em>',
    'step3.sub': 'Redirecting you to the Stripe secure checkout in 3 seconds to complete payment.',
    'step3.cta': 'Go to checkout now',
    'err.generic': 'Something failed. Try again in a moment.',
    'err.bad_nombre': 'Enter your full name.',
    'err.bad_email': 'Invalid email.',
    'err.bad_wa': 'Invalid WhatsApp. Use international format with country code.',
    'err.bad_provider': 'Choose a calendar provider.',
    'err.already_active': 'There is already an active subscription with this email or WhatsApp.',
    'err.signup_expired': 'Session expired. Please restart.',
    'err.email_max_intentos': 'Too many attempts with the email code. Restart.',
    'err.wa_max_intentos': 'Too many attempts with the WhatsApp code. Restart.',
    'msg.codes_sent': 'Codes sent to your email and WhatsApp. They expire in 10 minutes.',
    'msg.codes_partial': 'Codes don\'t match. Check both.',
    'msg.reenviado': 'Codes resent.',
  },
};

let lang = (navigator.language || 'es').startsWith('en') ? 'en' : 'es';

function t(key) { return TR[lang][key] || TR.es[key] || key; }

function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-html]').forEach(el => {
    el.innerHTML = t(el.dataset.i18nHtml);
  });
  document.title = t('title');
  document.documentElement.lang = lang;
  document.querySelectorAll('.lang-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.lang === lang);
  });
}

function setLang(l) { lang = l; applyI18n(); }

function showStep(name) {
  document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
  document.getElementById(`step-${name}`).classList.add('active');
  window.scrollTo(0, 0);
}

function showError(stepEl, msg, isSuccess = false) {
  const errs = document.getElementById(stepEl);
  errs.textContent = msg;
  errs.className = 'errors visible' + (isSuccess ? ' success' : '');
}
function clearError(stepEl) {
  const errs = document.getElementById(stepEl);
  errs.classList.remove('visible');
  errs.textContent = '';
}

async function apiCall(path, body) {
  const r = await fetch(API + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, ok: r.ok, body: j };
}

// Form 1: datos
document.getElementById('form-datos').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError('errors-step1');
  const btn = document.getElementById('btn-step1');
  btn.disabled = true;

  const fd = new FormData(e.target);
  const acepto = !!fd.get('acepto_terminos');
  if (!acepto) {
    showError('errors-step1', t('err.must_accept_terms')); btn.disabled = false; return;
  }
  // Esperamos a que el widget termine de cargar (async) antes de decidir.
  const token = await esperarTurnstileToken();
  if (turnstilePresente() && !token) {
    showError('errors-step1', t('err.captcha_required')); btn.disabled = false; return;
  }
  const data = {
    nombre: fd.get('nombre').trim(),
    email: fd.get('email').trim(),
    wa: fd.get('wa').trim(),
    idioma: lang,
    acepto_terminos: true,
    turnstile_token: token,
  };
  if (!data.nombre || data.nombre.length < 2) {
    showError('errors-step1', t('err.bad_nombre')); btn.disabled = false; return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    showError('errors-step1', t('err.bad_email')); btn.disabled = false; return;
  }
  const waClean = data.wa.replace(/[\s+\-()]/g, '');
  if (!/^\d{10,15}$/.test(waClean)) {
    showError('errors-step1', t('err.bad_wa')); btn.disabled = false; return;
  }

  const r = await apiCall('/start', data);
  resetTurnstile();
  btn.disabled = false;
  if (r.ok) {
    signupId = r.body.signup_id;
    showStep('codigos');
    showError('errors-step2', r.body.message || t('msg.codes_sent'), true);
  } else {
    showError('errors-step1', t(`err.${r.body.error || 'generic'}`) || r.body.message || t('err.generic'));
  }
});

// Form 2: códigos
document.getElementById('form-codigos').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError('errors-step2');
  const btn = document.getElementById('btn-step2');
  btn.disabled = true;

  const fd = new FormData(e.target);
  const r = await apiCall('/verify', {
    signup_id: signupId,
    email_code: fd.get('email_code').trim(),
    wa_code: fd.get('wa_code').trim(),
  });
  btn.disabled = false;

  if (r.ok && r.body.ok) {
    document.getElementById('link-checkout').href = r.body.checkout_url;
    showStep('pagar');
    setTimeout(() => { window.location.href = r.body.checkout_url; }, 3000);
  } else if (r.ok && !r.body.ok) {
    showError('errors-step2', t('msg.codes_partial'));
  } else {
    showError('errors-step2', t(`err.${r.body.error || 'generic'}`) || r.body.message || t('err.generic'));
  }
});

// Reenviar
document.getElementById('link-reenviar').addEventListener('click', async (e) => {
  e.preventDefault();
  if (!signupId) return;
  // Re-disparar el step1 con los mismos datos guardados implícitamente en el form
  const fd = new FormData(document.getElementById('form-datos'));
  const data = {
    nombre: fd.get('nombre').trim(),
    email: fd.get('email').trim(),
    wa: fd.get('wa').trim().replace(/[\s+\-()]/g, ''),
    acepto_terminos: true,
    turnstile_token: turnstileToken(),
  };
  const r = await apiCall('/start', data);
  resetTurnstile();
  if (r.ok) {
    showError('errors-step2', t('msg.reenviado'), true);
  } else {
    showError('errors-step2', t(`err.${r.body.error || 'generic'}`));
  }
});

// Corregir datos
document.getElementById('link-volver').addEventListener('click', (e) => {
  e.preventDefault();
  clearError('errors-step2');
  showStep('datos');
});

// Lang toggle
document.querySelectorAll('.lang-btn').forEach(b => {
  b.addEventListener('click', () => setLang(b.dataset.lang));
});

// ── Turnstile helpers ──
function turnstilePresente() { return !!document.querySelector('.cf-turnstile'); }
// Espera a que Turnstile (que carga async) produzca su token antes de bloquear.
// Evita el falso "captcha requerido" cuando el usuario apura el click antes de
// que el widget termine de renderizar. Devuelve el token, o '' si tras maxMs no
// hay (Turnstile genuinamente no cargó).
async function esperarTurnstileToken(maxMs = 6000) {
  if (!turnstilePresente()) return '';
  let token = turnstileToken();
  const t0 = Date.now();
  while (!token && Date.now() - t0 < maxMs) {
    await new Promise(r => setTimeout(r, 200));
    token = turnstileToken();
  }
  return token;
}
function turnstileToken() { return document.querySelector('[name="cf-turnstile-response"]')?.value || ''; }
function resetTurnstile() { try { if (typeof turnstile !== 'undefined') turnstile.reset(); } catch {} }

applyI18n();
