// turnstile.js — validación de Cloudflare Turnstile, compartida por cuenta y signup.
// Si TURNSTILE_SECRET_KEY no está seteado, salta (dev mode).

function _err(code, msg, status = 400) { const e = new Error(msg); e.code = code; e.status = status; return e; }

async function validar(token, req) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    console.warn('[turnstile] TURNSTILE_SECRET_KEY no configurado — saltando captcha (dev mode)');
    return true;
  }
  if (!token) throw _err('captcha_required', 'Captcha requerido');
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;
  const body = new URLSearchParams({ secret, response: token, remoteip: ip || '' });
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
  const j = await r.json();
  if (!j.success) {
    console.warn('[turnstile] fail:', j['error-codes'] || j);
    throw _err('captcha_invalid', 'Captcha inválido');
  }
  return true;
}

module.exports = { validar };
