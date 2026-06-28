// cuenta/script.js — portal de cliente passwordless

const API = '/maria/api/cuenta';
let canal = 'email';
let identificador = '';

const TR = {
  es: {
    'title': 'Tu cuenta — María',
    'nav.atras': '← maria.io',
    'login.h1': 'Tu cuenta.',
    'login.sub': 'Ingresá con tu email o WhatsApp. Te mandamos un código para entrar — sin contraseñas.',
    'login.por-email': 'Por email',
    'login.por-wa': 'Por WhatsApp',
    'login.lbl-email': 'Email',
    'login.lbl-wa': 'WhatsApp (con código de país)',
    'login.cta': 'Enviarme el código',
    'verify.h1': 'Ingresá el código.',
    'verify.sub': 'Si los datos son correctos, te mandamos un código de 6 dígitos.',
    'verify.lbl-code': 'Código',
    'verify.cta': 'Entrar',
    'verify.volver': 'Usar otro identificador',
    'me.h1': 'Hola, <em id="me-nombre"></em>.',
    'me.sub': 'Tu suscripción a María.',
    'me.estado': 'Estado',
    'me.email': 'Email',
    'me.wa': 'WhatsApp',
    'me.ultimo-cobro': 'Último cobro',
    'me.proximo-cobro': 'Próximo cobro',
    'me.portal': 'Ver pagos / actualizar tarjeta →',
    'me.cambiar': 'Cambiar email o WhatsApp',
    'me.cancelar': 'Cancelar suscripción',
    'me.salir': 'Salir',
    'estado.active': 'Activa',
    'estado.inactive': 'Pausada (fallo de cobro)',
    'estado.cancelled': 'Cancelada',
    'cambiar.h1': 'Cambiar datos.',
    'cambiar.lbl-email': 'Nuevo email (dejá vacío si no cambiás)',
    'cambiar.lbl-wa': 'Nuevo WhatsApp (con código de país)',
    'cambiar.cta': 'Guardar',
    'cambiar.volver': 'Volver',
    'reauth.h1': 'Confirmá con un código.',
    'reauth.sub-email': 'Por seguridad te mandamos un código de 6 dígitos a tu email.',
    'reauth.sub-wa': 'Por seguridad te mandamos un código de 6 dígitos a tu WhatsApp.',
    'reauth.lbl-code': 'Código',
    'reauth.cta': 'Confirmar',
    'reauth.reenviar': 'Reenviar código',
    'reauth.volver': 'Volver sin confirmar',
    'confirm.cancel': '¿Confirmás que querés cancelar la suscripción? No vas a recibir más cobros y vas a perder acceso a María.',
    'msg.code_sent': 'Si el dato es correcto, te enviamos un código.',
    'msg.otp_reenviado': 'Te mandamos un código nuevo.',
    'msg.changes_saved': 'Cambios guardados.',
    'msg.cancelled': 'Tu suscripción quedó cancelada. No vas a recibir más cobros.',
    'err.generic': 'Algo falló. Probá de nuevo.',
    'err.captcha_required': 'Completá el captcha.',
    'err.bad_code': 'Código incorrecto.',
    'err.session_expired': 'Tu sesión expiró. Volvé a entrar.',
    'err.no_otp': 'No hay un código activo. Pedí uno nuevo.',
    'err.max_intentos': 'Demasiados intentos. Esperá unos minutos.',
    'err.otp_faltante': 'Te falta el código. Ingresalo o pedí uno nuevo.',
    'err.otp_vencido': 'El código venció. Pedí uno nuevo con "Reenviar código".',
    'err.otp_invalido': 'Código incorrecto. Probá de nuevo.',
  },
  en: {
    'title': 'Your account — María',
    'nav.atras': '← maria.io',
    'login.h1': 'Your account.',
    'login.sub': 'Sign in with your email or WhatsApp. We send a code — no passwords.',
    'login.por-email': 'By email',
    'login.por-wa': 'By WhatsApp',
    'login.lbl-email': 'Email',
    'login.lbl-wa': 'WhatsApp (with country code)',
    'login.cta': 'Send me the code',
    'verify.h1': 'Enter the code.',
    'verify.sub': 'If your data is correct, we sent you a 6-digit code.',
    'verify.lbl-code': 'Code',
    'verify.cta': 'Enter',
    'verify.volver': 'Use another identifier',
    'me.h1': 'Hi, <em id="me-nombre"></em>.',
    'me.sub': 'Your María subscription.',
    'me.estado': 'Status',
    'me.email': 'Email',
    'me.wa': 'WhatsApp',
    'me.ultimo-cobro': 'Last charge',
    'me.proximo-cobro': 'Next charge',
    'me.portal': 'See payments / update card →',
    'me.cambiar': 'Change email or WhatsApp',
    'me.cancelar': 'Cancel subscription',
    'me.salir': 'Sign out',
    'estado.active': 'Active',
    'estado.inactive': 'Paused (payment failure)',
    'estado.cancelled': 'Cancelled',
    'cambiar.h1': 'Change data.',
    'cambiar.lbl-email': 'New email (leave blank to keep)',
    'cambiar.lbl-wa': 'New WhatsApp (with country code)',
    'cambiar.cta': 'Save',
    'cambiar.volver': 'Back',
    'reauth.h1': 'Confirm with a code.',
    'reauth.sub-email': 'For security, we sent a 6-digit code to your email.',
    'reauth.sub-wa': 'For security, we sent a 6-digit code to your WhatsApp.',
    'reauth.lbl-code': 'Code',
    'reauth.cta': 'Confirm',
    'reauth.reenviar': 'Resend code',
    'reauth.volver': 'Go back without confirming',
    'confirm.cancel': 'Confirm cancellation? You will not be charged again and will lose access to María.',
    'msg.code_sent': 'If the data is correct, we sent you a code.',
    'msg.otp_reenviado': 'We sent you a new code.',
    'msg.changes_saved': 'Changes saved.',
    'msg.cancelled': 'Your subscription has been cancelled. No further charges.',
    'err.generic': 'Something failed. Try again.',
    'err.captcha_required': 'Complete the captcha.',
    'err.bad_code': 'Wrong code.',
    'err.session_expired': 'Session expired. Sign in again.',
    'err.no_otp': 'No active code. Request a new one.',
    'err.max_intentos': 'Too many attempts. Wait a few minutes.',
    'err.otp_faltante': 'Code missing. Enter it or request a new one.',
    'err.otp_vencido': 'The code expired. Request a new one with "Resend code".',
    'err.otp_invalido': 'Wrong code. Try again.',
  },
};
let lang = (navigator.language || 'es').startsWith('en') ? 'en' : 'es';
function t(k) { return TR[lang][k] || TR.es[k] || k; }
function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-html]').forEach(el => { el.innerHTML = t(el.dataset.i18nHtml); });
  document.title = t('title');
  document.documentElement.lang = lang;
  document.querySelectorAll('.lang-btn').forEach(b => b.classList.toggle('active', b.dataset.lang === lang));
}
function setLang(l) { lang = l; applyI18n(); }
function showStep(name) {
  document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
  document.getElementById(`step-${name}`).classList.add('active');
  window.scrollTo(0, 0);
}
function showError(stepId, msg, ok=false) {
  const e = document.getElementById(stepId);
  e.textContent = msg;
  e.className = 'errors visible' + (ok ? ' success' : '');
}
function clearError(stepId) {
  const e = document.getElementById(stepId);
  e.classList.remove('visible');
  e.textContent = '';
}

async function api(path, body, method='POST') {
  const opts = { method, credentials: 'include' };
  if (body) {
    opts.headers = { 'Content-Type': 'application/json' };
    opts.body = JSON.stringify(body);
  }
  const r = await fetch(API + path, opts);
  const j = await r.json().catch(() => ({}));
  return { status: r.status, ok: r.ok, body: j };
}

// Toggle canal email/wa
document.querySelectorAll('input[name="canal"]').forEach(r => {
  r.addEventListener('change', () => {
    canal = r.value;
    document.getElementById('lbl-identificador').textContent = t(canal === 'email' ? 'login.lbl-email' : 'login.lbl-wa');
    document.querySelector('input[name="identificador"]').placeholder = canal === 'email' ? 'vos@empresa.com' : '+54 9 11 1234 5678';
    document.querySelector('input[name="identificador"]').type = canal === 'email' ? 'email' : 'tel';
  });
});

// Form login
document.getElementById('form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError('errors-login');
  const btn = document.getElementById('btn-login');
  btn.disabled = true;

  const fd = new FormData(e.target);
  identificador = fd.get('identificador').trim();
  const turnstileToken = (typeof turnstile !== 'undefined' && document.querySelector('.cf-turnstile'))
    ? (document.querySelector('[name="cf-turnstile-response"]')?.value || '')
    : '';

  const r = await api('/login', { canal, identificador, turnstile_token: turnstileToken });
  btn.disabled = false;
  if (r.ok) {
    showStep('verify');
  } else {
    showError('errors-login', t(`err.${r.body.error || 'generic'}`));
  }
});

// Form verify
document.getElementById('form-verify').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError('errors-verify');
  const btn = document.getElementById('btn-verify');
  btn.disabled = true;

  const fd = new FormData(e.target);
  const r = await api('/verify', { canal, identificador, code: fd.get('code').trim() });
  btn.disabled = false;
  if (r.ok) {
    await cargarMe();
    showStep('me');
  } else {
    showError('errors-verify', t(`err.${r.body.error || 'generic'}`));
  }
});

async function cargarMe() {
  const r = await api('/me', null, 'GET');
  if (!r.ok) {
    showStep('login'); showError('errors-login', t('err.session_expired'));
    return;
  }
  const cli = r.body;
  document.getElementById('me-nombre').textContent = cli.nombre;
  const estadoEl = document.getElementById('me-estado');
  estadoEl.textContent = t(`estado.${cli.estado}`);
  estadoEl.className = 'info-value estado-' + cli.estado;
  document.getElementById('me-email').textContent = cli.email;
  document.getElementById('me-wa').textContent = '+' + cli.wa;
  document.getElementById('me-ultimo').textContent = cli.ultimo_cobro_en ? new Date(cli.ultimo_cobro_en).toLocaleDateString() : '—';
  document.getElementById('me-proximo').textContent = cli.proximo_cobro_en ? new Date(cli.proximo_cobro_en).toLocaleDateString() : '—';
  const portalEl = document.getElementById('link-portal');
  if (cli.tiene_portal) {
    portalEl.style.display = '';
    portalEl.href = '#';
    portalEl.onclick = async (ev) => {
      ev.preventDefault();
      portalEl.style.pointerEvents = 'none';
      const pr = await api('/portal', {}, 'POST');
      portalEl.style.pointerEvents = '';
      if (pr.ok && pr.body && pr.body.url) window.location.href = pr.body.url;
      else alert(t('err.generic') || 'Error');
    };
  } else {
    portalEl.style.display = 'none';
  }
}

document.getElementById('link-volver-login').addEventListener('click', e => { e.preventDefault(); showStep('login'); });
document.getElementById('link-logout').addEventListener('click', async e => {
  e.preventDefault();
  await api('/logout');
  showStep('login');
});
document.getElementById('btn-cambiar').addEventListener('click', () => showStep('cambiar'));
document.getElementById('link-volver-me').addEventListener('click', e => { e.preventDefault(); showStep('me'); });

// ---- Reauth OTP (código fresco exigido por /update y /cancel) ----
let reauthAccion = null;       // { path, body, volverA, erroresId, onOk }
let reauthCooldownHasta = 0;   // timestamp ms hasta el que no se puede reenviar
let reauthTimer = null;

function actualizarLinkReenviar() {
  const link = document.getElementById('link-reenviar-otp');
  const restan = Math.ceil((reauthCooldownHasta - Date.now()) / 1000);
  if (restan > 0) {
    link.textContent = `${t('reauth.reenviar')} (${restan}s)`;
    link.style.opacity = '0.5';
    link.style.cursor = 'default';
  } else {
    link.textContent = t('reauth.reenviar');
    link.style.opacity = '';
    link.style.cursor = '';
    if (reauthTimer) { clearInterval(reauthTimer); reauthTimer = null; }
  }
}

function iniciarCooldown() {
  reauthCooldownHasta = Date.now() + 60000;
  actualizarLinkReenviar();
  if (!reauthTimer) reauthTimer = setInterval(actualizarLinkReenviar, 1000);
}

async function pedirReauthCode() {
  const r = await api('/reauth-code', { canal });
  if (r.status === 401) {
    reauthAccion = null;
    showStep('login');
    showError('errors-login', t('err.session_expired'));
    return false;
  }
  if (r.ok) iniciarCooldown();
  return r.ok;
}

async function iniciarReauth(accion) {
  reauthAccion = accion;
  document.getElementById('form-reauth').reset();
  clearError('errors-reauth');
  const sub = document.getElementById('reauth-sub');
  sub.dataset.i18n = canal === 'wa' ? 'reauth.sub-wa' : 'reauth.sub-email';
  sub.textContent = t(sub.dataset.i18n);
  const ok = await pedirReauthCode();
  if (ok) {
    showStep('reauth');
  } else if (reauthAccion) {
    reauthAccion = null;
    if (accion.erroresId) showError(accion.erroresId, t('err.generic'));
    else alert(t('err.generic'));
  }
}

document.getElementById('form-reauth').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!reauthAccion) { showStep('me'); return; }
  clearError('errors-reauth');
  const btn = document.getElementById('btn-reauth');
  btn.disabled = true;
  const otp = (new FormData(e.target).get('otp') || '').trim();
  const r = await api(reauthAccion.path, { ...reauthAccion.body, otp });
  btn.disabled = false;
  if (r.ok) {
    const fin = reauthAccion;
    reauthAccion = null;
    await fin.onOk(r);
    return;
  }
  if (r.status === 401 && r.body.error === 'otp_required') {
    if (r.body.motivo === 'vencido') showError('errors-reauth', t('err.otp_vencido'));
    else if (r.body.motivo === 'faltante') showError('errors-reauth', t('err.otp_faltante'));
    else showError('errors-reauth', t('err.otp_invalido'));
  } else if (r.status === 429 || r.body.error === 'max_intentos') {
    showError('errors-reauth', t('err.max_intentos'));
  } else if (r.status === 401) {
    reauthAccion = null;
    showStep('login');
    showError('errors-login', t('err.session_expired'));
  } else {
    showError('errors-reauth', t(`err.${r.body.error || 'generic'}`));
  }
});

document.getElementById('link-reenviar-otp').addEventListener('click', async (e) => {
  e.preventDefault();
  if (Date.now() < reauthCooldownHasta) return; // cooldown 60s
  clearError('errors-reauth');
  const ok = await pedirReauthCode();
  if (ok) showError('errors-reauth', t('msg.otp_reenviado'), true);
  else if (reauthAccion) showError('errors-reauth', t('err.generic'));
});

document.getElementById('link-reauth-volver').addEventListener('click', (e) => {
  e.preventDefault();
  const volverA = (reauthAccion && reauthAccion.volverA) || 'me';
  reauthAccion = null;
  showStep(volverA);
});

document.getElementById('form-cambiar').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError('errors-cambiar');
  const fd = new FormData(e.target);
  const body = {};
  if (fd.get('nuevo_email')) body.nuevo_email = fd.get('nuevo_email').trim();
  if (fd.get('nuevo_wa')) body.nuevo_wa = fd.get('nuevo_wa').trim();
  const btn = document.getElementById('btn-cambiar-submit');
  btn.disabled = true;
  await iniciarReauth({
    path: '/update',
    body,
    volverA: 'cambiar',
    erroresId: 'errors-cambiar',
    onOk: async () => {
      await cargarMe();
      showStep('cambiar');
      showError('errors-cambiar', t('msg.changes_saved'), true);
      setTimeout(() => showStep('me'), 1500);
    },
  });
  btn.disabled = false;
});

document.getElementById('btn-cancelar').addEventListener('click', async () => {
  if (!confirm(t('confirm.cancel'))) return;
  const btn = document.getElementById('btn-cancelar');
  btn.disabled = true;
  await iniciarReauth({
    path: '/cancel',
    body: {},
    volverA: 'me',
    erroresId: null,
    onOk: async () => {
      alert(t('msg.cancelled'));
      await cargarMe();
      showStep('me');
    },
  });
  btn.disabled = false;
});

document.querySelectorAll('.lang-btn').forEach(b => b.addEventListener('click', () => setLang(b.dataset.lang)));

// Setup Turnstile site key (set via meta tag at deploy time, or hardcoded)
// Por ahora, leemos del DOM. Si no hay sitekey, el widget no renderea.
const ts = document.getElementById('turnstile-container');
const tsKey = ts.dataset.sitekey;
if (!tsKey) {
  // Sin Turnstile configurado todavía. Backend acepta sin captcha en dev mode.
  ts.style.display = 'none';
}

applyI18n();

// Si ya hay sesión activa (cookie), saltar directo a me.
(async () => {
  const r = await api('/me', null, 'GET');
  if (r.ok) { await cargarMe(); showStep('me'); }
})();
