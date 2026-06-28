// routes/signup.js
//   POST /signup/start  → genera 2 códigos y los envía vía Maria signup_bot
//   POST /signup/verify → valida códigos, devuelve { signup_token, checkout_url }

const express = require('express');
const codes = require('../lib/codes');
const db = require('../lib/db');
const turnstile = require('../lib/turnstile');
const ratelimit = require('../lib/ratelimit');
const stripe = require('../lib/stripe');

// Límites del signup (manda email + WA a direcciones arbitrarias vía el
// signup_bot real → vector de spam/abuso del número de WA y del dominio).
const LIM_IP    = { max: Number(process.env.SIGNUP_LIM_IP || 5),    ventanaMs: 60 * 60_000 }; // 5/h por IP
const LIM_ID    = { max: Number(process.env.SIGNUP_LIM_ID || 3),    ventanaMs: 60 * 60_000 }; // 3/h por email|wa
const LIM_GLOBAL= { max: Number(process.env.SIGNUP_LIM_GLOBAL || 60), ventanaMs: 60 * 60_000 }; // 60/h total

const router = express.Router();

// Validación básica de inputs
function _validateStart(b) {
  if (!b || typeof b !== 'object') throw _err('bad_body', 'Body inválido');
  const { nombre, email, wa } = b;
  if (!nombre || typeof nombre !== 'string' || nombre.length < 2 || nombre.length > 100)
    throw _err('bad_nombre', 'Nombre inválido');
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw _err('bad_email', 'Email inválido');
  // wa esperado: solo dígitos, 10-15 chars. Aceptamos +/espacios y los limpiamos.
  const waClean = String(wa || '').replace(/[\s+\-()]/g, '');
  if (!/^\d{10,15}$/.test(waClean)) throw _err('bad_wa', 'WhatsApp inválido (10-15 dígitos)');
  // Términos y Condiciones — obligatorio
  if (!b.acepto_terminos || b.acepto_terminos !== true) {
    throw _err('must_accept_terms', 'Tenés que aceptar los Términos y Condiciones para continuar.');
  }
  // calendar_provider: SIEMPRE 'ninguno' por default — Maria configura después
  // el provider real por chat con el cliente, basado en el dominio del email
  // u onboarding F4. Acá no preguntamos para minimizar fricción.
  const idioma = (b.idioma === 'en') ? 'en' : 'es';
  return { nombre: nombre.trim(), email: email.toLowerCase().trim(), wa: waClean, calendar_provider: 'ninguno', acepto_terminos: true, idioma };
}

function _err(code, message, status = 400) {
  const e = new Error(message);
  e.code = code;
  e.status = status;
  return e;
}

router.post('/start', async (req, res, next) => {
  try {
    // Captcha primero (barato de rechazar) y rate-limit antes de tocar nada.
    await turnstile.validar(req.body && req.body.turnstile_token, req);
    const ip = ratelimit.ipDe(req);
    if (!ratelimit.permitir('signup_global', LIM_GLOBAL)) throw _err('rate_limited', 'Demasiadas solicitudes. Probá más tarde.', 429);
    if (!ratelimit.permitir(`signup_ip:${ip}`, LIM_IP)) throw _err('rate_limited', 'Demasiados intentos desde tu conexión. Esperá un rato.', 429);

    const data = _validateStart(req.body);
    if (!ratelimit.permitir(`signup_id:${data.email}`, LIM_ID) || !ratelimit.permitir(`signup_id:${data.wa}`, LIM_ID)) {
      throw _err('rate_limited', 'Ya pediste varios códigos para estos datos. Esperá unos minutos.', 429);
    }
    const r = codes.iniciarSignup(data);
    res.json({
      ok: true,
      signup_id: r.signup_id,
      message: r.reutilizado
        ? 'Te reenviamos los códigos a tu email y WhatsApp.'
        : 'Códigos enviados a tu email y WhatsApp. Vencen en 10 minutos.',
    });
  } catch (err) {
    next(err);
  }
});

router.post('/verify', async (req, res, next) => {
  try {
    const { signup_id, email_code, wa_code } = req.body || {};
    if (!signup_id) throw _err('bad_signup_id', 'Falta signup_id');
    const r = codes.verificarSignup({ signup_id, email_code, wa_code });
    if (!r.ok) {
      return res.json({
        ok: false,
        email_verified: r.email_verified,
        wa_verified: r.wa_verified,
        message: 'Códigos parciales. Ingresá ambos correctamente.',
      });
    }

    // Crear una Checkout Session de Stripe con el signup_token en metadata,
    // para recuperarlo en el webhook checkout.session.completed.
    const priceId = process.env.STRIPE_PRICE_ID;
    const landing = process.env.INTENSA_LANDING_BASE || 'https://intensa.io/maria';
    if (!priceId) {
      console.error('[signup/verify] STRIPE_PRICE_ID no configurado');
      throw _err('checkout_not_configured', 'El checkout no está configurado. Probá más tarde.', 503);
    }

    const row = db.control().prepare(`SELECT nombre, email FROM signup_pending WHERE signup_token=?`).get(r.signup_token);

    let checkoutUrl;
    try {
      const session = await stripe.api('POST', '/checkout/sessions', {
        mode: 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],
        customer_email: row?.email || undefined,
        client_reference_id: r.signup_token,
        metadata: { signup_token: r.signup_token },
        subscription_data: { metadata: { signup_token: r.signup_token } },
        allow_promotion_codes: true,
        success_url: `${landing}/signup/?status=ok`,
        cancel_url: `${landing}/signup/?status=cancel`,
      });
      checkoutUrl = session.url;
    } catch (e) {
      console.error('[signup/verify] crear checkout de Stripe falló:', e.message);
      throw _err('checkout_failed', 'No pudimos iniciar el checkout. Probá de nuevo en un momento.', 502);
    }

    res.json({
      ok: true,
      email_verified: true,
      wa_verified: true,
      signup_token: r.signup_token,
      checkout_url: checkoutUrl,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
