// routes/cuenta.js — portal del cliente. Login passwordless por código a email/WA.
//   POST /cuenta/login   { canal, identificador, turnstile_token } → manda OTP
//   POST /cuenta/verify  { canal, identificador, code }             → setea cookie de sesión
//   POST /cuenta/logout                                              → borra cookie
//   GET  /cuenta/me                                                  → datos del cliente
//   POST /cuenta/reauth-code { canal? }   → manda OTP fresco para confirmar operación sensible
//   POST /cuenta/update  { nuevo_email? nuevo_wa? otp }              → exige OTP fresco y actualiza
//   POST /cuenta/cancel  { otp }                                     → exige OTP fresco y cancela LS

const express = require('express');
const crypto = require('crypto');
const db = require('../lib/db');
const instances = require('../lib/instances');
const mariaRpc = require('../lib/maria-rpc');
const stripe = require('../lib/stripe');

const router = express.Router();
const SESSION_COOKIE = 'intensa_cuenta';
const SESSION_TTL_MIN = 30;
const OTP_TTL_MIN = 10;
const MAX_INTENTOS = 5;

function _err(code, msg, status=400) { const e = new Error(msg); e.code = code; e.status = status; return e; }
function _genCode() {
  let s = ''; while (s.length < 6) s += crypto.randomInt(0,10).toString(); return s;
}

const _turnstileLib = require('../lib/turnstile');
async function _validateTurnstile(token, req) { return _turnstileLib.validar(token, req); }

router.post('/login', async (req, res, next) => {
  try {
    const { canal, identificador, turnstile_token } = req.body || {};
    if (!['email','wa'].includes(canal)) throw _err('bad_canal', 'Canal inválido');
    if (!identificador) throw _err('bad_id', 'Falta identificador');
    await _validateTurnstile(turnstile_token, req);

    const c = db.control();
    let cliente;
    if (canal === 'email') {
      cliente = c.prepare(`SELECT * FROM clientes WHERE email=?`).get(String(identificador).toLowerCase());
    } else {
      const wa = String(identificador).replace(/[\s+\-()]/g,'');
      cliente = c.prepare(`SELECT * FROM clientes WHERE wa=?`).get(wa);
    }
    // Siempre respondemos OK para no filtrar existencia de cuentas. Si no existe, no mandamos código.
    if (!cliente) {
      console.log(`[cuenta/login] identificador desconocido (${canal}): ${identificador}`);
      return res.json({ ok: true, message: 'Si el dato es correcto, te enviamos un código.' });
    }

    const code = _genCode();
    const expira = new Date(Date.now() + OTP_TTL_MIN * 60_000).toISOString();
    c.prepare(`INSERT INTO portal_otp (cliente_id, canal, proposito, code, expira_en) VALUES (?, ?, 'login', ?, ?)`)
      .run(cliente.id, canal, code, expira);

    // Enviar código por el canal pedido vía Maria signup_bot
    const bot = instances.signupBot();
    if (!bot) throw _err('no_signup_bot', 'No hay instancia signup_bot configurada', 503);
    if (canal === 'email') {
      mariaRpc.sendEmail(bot, {
        to: cliente.email,
        subject: 'Tu código para acceder a tu cuenta en María',
        html: `<p>Hola ${cliente.nombre},</p><p>Tu código es: <b style="font-size:24px;letter-spacing:6px">${code}</b></p><p>Vence en 10 minutos.</p>`,
      }).catch(e => console.error('[cuenta/login] sendEmail:', e.message));
    } else {
      mariaRpc.sendWa(bot, {
        to: cliente.wa,
        body: `Hola ${cliente.nombre}, soy María. Tu código para acceder a tu cuenta es:\n\n*${code}*\n\nVence en 10 minutos.`,
      }).catch(e => console.error('[cuenta/login] sendWa:', e.message));
    }

    res.json({ ok: true, message: 'Te enviamos un código.' });
  } catch (err) {
    next(err);
  }
});

router.post('/verify', async (req, res, next) => {
  try {
    const { canal, identificador, code } = req.body || {};
    if (!canal || !identificador || !code) throw _err('bad_body', 'Faltan campos');

    const c = db.control();
    let cliente;
    if (canal === 'email') {
      cliente = c.prepare(`SELECT * FROM clientes WHERE email=?`).get(String(identificador).toLowerCase());
    } else {
      const wa = String(identificador).replace(/[\s+\-()]/g,'');
      cliente = c.prepare(`SELECT * FROM clientes WHERE wa=?`).get(wa);
    }
    if (!cliente) throw _err('not_found', 'Credenciales inválidas', 401);

    // Buscar el OTP más reciente válido (solo de login — los de reauth no sirven para entrar)
    const otp = c.prepare(`
      SELECT * FROM portal_otp
      WHERE cliente_id=? AND canal=? AND proposito='login' AND usado=0 AND expira_en > datetime('now')
      ORDER BY id DESC LIMIT 1
    `).get(cliente.id, canal);
    if (!otp) throw _err('no_otp', 'No hay código activo o expiró', 401);
    if (otp.intentos >= MAX_INTENTOS) throw _err('max_intentos', 'Demasiados intentos', 429);

    if (otp.code !== code) {
      c.prepare(`UPDATE portal_otp SET intentos=intentos+1 WHERE id=?`).run(otp.id);
      throw _err('bad_code', 'Código incorrecto', 401);
    }

    // Marcar usado, crear sesión
    c.prepare(`UPDATE portal_otp SET usado=1 WHERE id=?`).run(otp.id);
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const sessionExpira = new Date(Date.now() + SESSION_TTL_MIN * 60_000).toISOString();
    c.prepare(`
      INSERT INTO portal_sessions (cliente_id, token, expira_en, ip_origen, user_agent)
      VALUES (?, ?, ?, ?, ?)
    `).run(cliente.id, sessionToken, sessionExpira,
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress,
      req.headers['user-agent'] || null);

    res.cookie(SESSION_COOKIE, sessionToken, {
      httpOnly: true, secure: true, sameSite: 'lax',
      maxAge: SESSION_TTL_MIN * 60_000, path: '/maria/api',
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

function _requireSession(req, res, next) {
  const tok = req.cookies?.[SESSION_COOKIE];
  if (!tok) return next(_err('unauthorized', 'No autenticado', 401));
  const c = db.control();
  const s = c.prepare(`SELECT s.*, c.* FROM portal_sessions s JOIN clientes c ON c.id=s.cliente_id WHERE s.token=? AND s.expira_en > datetime('now')`).get(tok);
  if (!s) return next(_err('session_expired', 'Sesión expirada', 401));
  req.cliente = s;
  next();
}

router.post('/logout', _requireSession, (req, res) => {
  const tok = req.cookies?.[SESSION_COOKIE];
  db.control().prepare(`DELETE FROM portal_sessions WHERE token=?`).run(tok);
  res.clearCookie(SESSION_COOKIE);
  res.json({ ok: true });
});

router.get('/me', _requireSession, (req, res) => {
  const cli = req.cliente;
  res.json({
    nombre: cli.nombre,
    email: cli.email,
    wa: cli.wa,
    estado: cli.estado,
    creado: cli.creado,
    ultimo_cobro_en: cli.ultimo_cobro_en,
    proximo_cobro_en: cli.proximo_cobro_en,
    tiene_portal: !!cli.stripe_customer_id,
  });
});

// Crea una sesión del Billing Portal de Stripe (ver pagos / actualizar tarjeta).
// La URL es de un solo uso y de corta vida, por eso se genera on-demand.
router.post('/portal', _requireSession, async (req, res, next) => {
  try {
    const customerId = req.cliente.stripe_customer_id;
    if (!customerId) throw _err('no_customer', 'No tenés datos de pago todavía', 409);
    const landing = process.env.INTENSA_LANDING_BASE || 'https://intensa.io/maria';
    const session = await stripe.api('POST', '/billing_portal/sessions', {
      customer: customerId,
      return_url: `${landing}/cuenta/`,
    });
    res.json({ ok: true, url: session.url });
  } catch (err) {
    if (err.stripe) return next(_err('portal_failed', `Stripe: ${err.message}`, 502));
    next(err);
  }
});

// ── Re-confirmación con OTP fresco para operaciones sensibles ────────────────
// La sesión sola no alcanza para /update y /cancel: si la cookie se filtra,
// el atacante igual necesita acceso al email/WA del cliente. El flujo es:
//   1. POST /reauth-code  → manda un código nuevo al canal elegido
//   2. POST /update|/cancel con { otp } → se valida y se quema (un solo uso)

const REAUTH_COOLDOWN_SEG = 60; // no re-enviar si ya mandamos uno hace <60s

router.post('/reauth-code', _requireSession, async (req, res, next) => {
  try {
    const canal = (req.body || {}).canal || 'email';
    if (!['email','wa'].includes(canal)) throw _err('bad_canal', 'Canal inválido');
    const cli = req.cliente;
    const c = db.control();

    // Rate-limit básico: si ya emitimos un código de reauth hace <60s, no spamear.
    const reciente = c.prepare(`
      SELECT id FROM portal_otp
      WHERE cliente_id=? AND proposito='reauth' AND usado=0
        AND expira_en > datetime('now')
        AND creado > datetime('now', '-' || ? || ' seconds')
      ORDER BY id DESC LIMIT 1
    `).get(cli.id, REAUTH_COOLDOWN_SEG);
    if (reciente) return res.json({ ok: true, message: 'Ya te enviamos un código. Revisá tu bandeja.' });

    // Invalidar códigos de reauth anteriores: solo el último emitido vale.
    c.prepare(`UPDATE portal_otp SET usado=1 WHERE cliente_id=? AND proposito='reauth' AND usado=0`).run(cli.id);

    const code = _genCode();
    const expira = new Date(Date.now() + OTP_TTL_MIN * 60_000).toISOString();
    c.prepare(`INSERT INTO portal_otp (cliente_id, canal, proposito, code, expira_en) VALUES (?, ?, 'reauth', ?, ?)`)
      .run(cli.id, canal, code, expira);

    // Enviar por el mismo mecanismo que el login (Maria signup_bot)
    const bot = instances.signupBot();
    if (!bot) throw _err('no_signup_bot', 'No hay instancia signup_bot configurada', 503);
    if (canal === 'email') {
      mariaRpc.sendEmail(bot, {
        to: cli.email,
        subject: 'Tu código para confirmar cambios en tu cuenta de María',
        html: `<p>Hola ${cli.nombre},</p><p>Tu código para confirmar la operación es: <b style="font-size:24px;letter-spacing:6px">${code}</b></p><p>Vence en 10 minutos. Si no estás haciendo cambios en tu cuenta, ignorá este mensaje.</p>`,
      }).catch(e => console.error('[cuenta/reauth-code] sendEmail:', e.message));
    } else {
      mariaRpc.sendWa(bot, {
        to: cli.wa,
        body: `Hola ${cli.nombre}, soy María. Tu código para confirmar la operación en tu cuenta es:\n\n*${code}*\n\nVence en 10 minutos. Si no estás haciendo cambios, ignorá este mensaje.`,
      }).catch(e => console.error('[cuenta/reauth-code] sendWa:', e.message));
    }

    res.json({ ok: true, message: 'Te enviamos un código para confirmar.' });
  } catch (err) { next(err); }
});

// Middleware: exige body.otp validado contra el último código de reauth vigente.
// Sin otp / vencido / incorrecto → 401 { error: 'otp_required', motivo }.
// El código es de un solo uso: se quema acá, antes de ejecutar la operación.
function _requireOtpFresco(req, res, next) {
  const otp = String((req.body || {}).otp ?? '').trim();
  if (!otp) {
    const e = _err('otp_required', 'Falta el código de confirmación', 401);
    e.motivo = 'faltante';
    return next(e);
  }
  const c = db.control();
  const row = c.prepare(`
    SELECT * FROM portal_otp
    WHERE cliente_id=? AND proposito='reauth' AND usado=0 AND expira_en > datetime('now')
    ORDER BY id DESC LIMIT 1
  `).get(req.cliente.id);
  if (!row) {
    const e = _err('otp_required', 'No hay código activo o expiró. Pedí uno nuevo.', 401);
    e.motivo = 'vencido';
    return next(e);
  }
  if (row.intentos >= MAX_INTENTOS) return next(_err('max_intentos', 'Demasiados intentos', 429));
  if (row.code !== otp) {
    c.prepare(`UPDATE portal_otp SET intentos=intentos+1 WHERE id=?`).run(row.id);
    const e = _err('otp_required', 'Código incorrecto', 401);
    e.motivo = 'invalido';
    return next(e);
  }
  c.prepare(`UPDATE portal_otp SET usado=1 WHERE id=?`).run(row.id);
  next();
}

router.post('/update', _requireSession, _requireOtpFresco, async (req, res, next) => {
  try {
    const { nuevo_email, nuevo_wa } = req.body || {};
    if (!nuevo_email && !nuevo_wa) throw _err('bad_body', 'Pasá nuevo_email o nuevo_wa');
    const c = db.control();
    const sets = [];
    const vals = [];
    if (nuevo_email) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nuevo_email)) throw _err('bad_email','Email inválido');
      sets.push('email=?'); vals.push(nuevo_email.toLowerCase());
    }
    if (nuevo_wa) {
      const w = String(nuevo_wa).replace(/[\s+\-()]/g,'');
      if (!/^\d{10,15}$/.test(w)) throw _err('bad_wa','WhatsApp inválido');
      sets.push('wa=?'); vals.push(w);
    }
    sets.push("actualizado=datetime('now')");
    vals.push(req.cliente.id);
    c.prepare(`UPDATE clientes SET ${sets.join(', ')} WHERE id=?`).run(...vals);

    // Sincronizar a la instancia (cambiar email/wa en usuarios)
    const Database = require('better-sqlite3');
    const idb = new Database(`/root/secretaria/state/${req.cliente.instancia_slug}/db/maria.sqlite`);
    try {
      const usets = [];
      const uvals = [];
      if (nuevo_email) { usets.push('email=?'); uvals.push(nuevo_email.toLowerCase()); }
      if (nuevo_wa)    { usets.push('wa_cus=?'); uvals.push(`${String(nuevo_wa).replace(/[\s+\-()]/g,'')}@c.us`); }
      uvals.push(req.cliente.instancia_usuario_id);
      idb.prepare(`UPDATE usuarios SET ${usets.join(', ')} WHERE id=?`).run(...uvals);
    } finally { idb.close(); }

    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.post('/cancel', _requireSession, _requireOtpFresco, async (req, res, next) => {
  try {
    const subId = req.cliente.stripe_subscription_id;
    if (!subId) throw _err('no_sub', 'No tenés suscripción activa', 409);
    // Cancelación inmediata en Stripe (DELETE /v1/subscriptions/:id).
    // El webhook customer.subscription.deleted hace el resto del cleanup.
    try {
      await stripe.api('DELETE', `/subscriptions/${subId}`);
    } catch (e) {
      // Si Stripe dice que ya no existe / ya estaba cancelada, lo tratamos como éxito.
      if (e.status === 404 || (e.stripe && e.stripe.code === 'resource_missing')) {
        console.warn(`[cuenta/cancel] sub ${subId} ya no existe en Stripe — sigo`);
      } else {
        throw _err('stripe_cancel_failed', `Stripe respondió ${e.status}: ${e.message}`, 502);
      }
    }
    res.json({ ok: true, message: 'Tu suscripción quedó cancelada. No vas a recibir más cobros.' });
  } catch (err) { next(err); }
});

module.exports = router;
