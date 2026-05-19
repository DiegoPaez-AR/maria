// routes/signup.js
//   POST /signup/start  → genera 2 códigos y los envía vía Maria signup_bot
//   POST /signup/verify → valida códigos, devuelve { signup_token, checkout_url }

const express = require('express');
const codes = require('../lib/codes');
const db = require('../lib/db');

const router = express.Router();

// Validación básica de inputs
function _validateStart(b) {
  if (!b || typeof b !== 'object') throw _err('bad_body', 'Body inválido');
  const { nombre, email, wa, calendar_provider } = b;
  if (!nombre || typeof nombre !== 'string' || nombre.length < 2 || nombre.length > 100)
    throw _err('bad_nombre', 'Nombre inválido');
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw _err('bad_email', 'Email inválido');
  // wa esperado: solo dígitos, 10-15 chars. Aceptamos +/espacios y los limpiamos.
  const waClean = String(wa || '').replace(/[\s+\-()]/g, '');
  if (!/^\d{10,15}$/.test(waClean)) throw _err('bad_wa', 'WhatsApp inválido (10-15 dígitos)');
  if (calendar_provider && !['google', 'microsoft', 'caldav'].includes(calendar_provider))
    throw _err('bad_provider', 'Provider de calendar inválido');
  // Términos y Condiciones — obligatorio
  if (!b.acepto_terminos || b.acepto_terminos !== true) {
    throw _err('must_accept_terms', 'Tenés que aceptar los Términos y Condiciones para continuar.');
  }
  return { nombre: nombre.trim(), email: email.toLowerCase().trim(), wa: waClean, calendar_provider: calendar_provider || null, acepto_terminos: true };
}

function _err(code, message, status = 400) {
  const e = new Error(message);
  e.code = code;
  e.status = status;
  return e;
}

router.post('/start', async (req, res, next) => {
  try {
    const data = _validateStart(req.body);
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

    // Construir checkout URL de LemonSqueezy con el signup_token
    const productVariant = process.env.LEMON_PRODUCT_VARIANT_ID;
    const buyBase = process.env.LEMON_BUY_BASE; // ej. https://intensa.lemonsqueezy.com/buy/abc-def
    if (!productVariant || !buyBase) {
      console.warn('[signup/verify] LEMON_PRODUCT_VARIANT_ID o LEMON_BUY_BASE no configurado — devolviendo URL de placeholder');
    }

    const checkoutUrl = _buildCheckoutUrl(buyBase, {
      checkout_data: { custom: { signup_token: r.signup_token } },
    });

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

function _buildCheckoutUrl(buyBase, opts) {
  if (!buyBase) return '#lemon-not-configured';
  // LemonSqueezy acepta query params para preset y custom data:
  // ?checkout[custom][signup_token]=XYZ&checkout[email]=...&checkout[name]=...
  const u = new URL(buyBase);
  if (opts.checkout_data && opts.checkout_data.custom) {
    for (const [k, v] of Object.entries(opts.checkout_data.custom)) {
      u.searchParams.set(`checkout[custom][${k}]`, v);
    }
  }
  return u.toString();
}

module.exports = router;
