// routes/webhook.js — POST /webhook
// Valida firma HMAC del header X-Signature, dedupea por event_id, procesa eventos.

const express = require('express');
const crypto = require('crypto');
const db = require('../lib/db');
const instances = require('../lib/instances');
const mariaRpc = require('../lib/maria-rpc');
const archive = require('../lib/archive');
const Database = require('better-sqlite3');

// Necesitamos el body crudo para validar HMAC. Express.json() ya parsea; necesitamos
// un middleware previo que capture el raw.
const router = express.Router();
router.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf; } }));

router.post('/', async (req, res, next) => {
  try {
    const secret = process.env.LEMON_WEBHOOK_SECRET;
    if (!secret) {
      console.error('[webhook] LEMON_WEBHOOK_SECRET no configurado — rechazando webhook por seguridad');
      return res.status(503).json({ error: 'webhook_not_configured' });
    }
    const sig = req.headers['x-signature'];
    if (!sig) return res.status(401).json({ error: 'missing_signature' });

    // Validar HMAC-SHA256 del body crudo con secret
    const expected = crypto.createHmac('sha256', secret).update(req.rawBody).digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      console.warn('[webhook] firma inválida');
      return res.status(401).json({ error: 'invalid_signature' });
    }

    const evt = req.body;
    const eventName = evt?.meta?.event_name;
    const eventId = evt?.meta?.webhook_id || evt?.data?.id;
    if (!eventName || !eventId) {
      return res.status(400).json({ error: 'malformed_event' });
    }

    // Dedupe por event_id (un mismo event puede llegar dos veces si LS reintenta)
    const c = db.control();
    const exist = c.prepare(`SELECT id, procesado FROM webhook_events WHERE ls_event_id=?`).get(eventId);
    if (exist && exist.procesado) {
      console.log(`[webhook] ${eventName} (id=${eventId}) ya procesado, skip`);
      return res.json({ ok: true, dedup: true });
    }
    if (!exist) {
      c.prepare(`INSERT INTO webhook_events (ls_event_id, event_name, payload) VALUES (?, ?, ?)`)
        .run(eventId, eventName, JSON.stringify(evt));
    }

    // Procesar según event_name
    try {
      await _procesar(eventName, evt);
      c.prepare(`UPDATE webhook_events SET procesado=1, procesado_en=datetime('now') WHERE ls_event_id=?`)
        .run(eventId);
      res.json({ ok: true });
    } catch (procErr) {
      c.prepare(`UPDATE webhook_events SET error=? WHERE ls_event_id=?`)
        .run(procErr.message, eventId);
      console.error(`[webhook] error procesando ${eventName} (${eventId}):`, procErr.stack || procErr);
      // 5xx para que LS reintente
      res.status(500).json({ error: 'processing_failed' });
    }
  } catch (err) {
    next(err);
  }
});

async function _procesar(eventName, evt) {
  const data = evt.data || {};
  const attrs = data.attributes || {};
  const custom = attrs.first_subscription_item?.custom_data || attrs.custom_data
    || evt.meta?.custom_data || {};
  const signupToken = custom.signup_token;

  console.log(`[webhook] ${eventName} attrs.user_email=${attrs.user_email} signup_token=${signupToken ? signupToken.slice(0,8) + '…' : '(none)'}`);

  if (eventName === 'subscription_created') {
    return _onSubscriptionCreated(evt, signupToken);
  }
  if (eventName === 'subscription_updated') {
    return _onSubscriptionUpdated(evt);
  }
  if (eventName === 'subscription_payment_success' || eventName === 'subscription_payment_recovered') {
    return _onPaymentSuccess(evt);
  }
  if (eventName === 'subscription_payment_failed') {
    return _onPaymentFailed(evt);
  }
  if (eventName === 'subscription_cancelled') {
    return _onSubscriptionCancelled(evt);
  }
  console.log(`[webhook] evento ${eventName} sin handler — guardado y marcado OK`);
}

async function _onSubscriptionCreated(evt, signupToken) {
  const c = db.control();
  const data = evt.data;
  const attrs = data.attributes;
  const subscriptionId = String(data.id);
  const customerId = String(attrs.customer_id);

  // Buscar el signup_pending por token
  let pending = null;
  if (signupToken) {
    pending = c.prepare(`SELECT * FROM signup_pending WHERE signup_token=?`).get(signupToken);
  }
  if (!pending) {
    console.warn(`[webhook] subscription_created sin signup_pending matching. Token=${signupToken}. Datos LS: email=${attrs.user_email}`);
    // Fallback: usar email del checkout. Sin signup completado, no podemos validar wa.
    // Creamos cliente con datos de LS pero sin asignar instancia (queda manual).
    return _crearClienteSinSignup(evt);
  }

  // Asignar instancia
  const instance = instances.assignBestInstance();
  if (!instance) {
    throw new Error('No hay instancia con cupo disponible. Cliente queda sin asignar — revisar manual.');
  }

  // Crear usuario en la DB de la instancia.
  // Si el cliente eligió "ninguno" en el signup, el usuario nace con
  // calendar_provider='google' (placeholder) y calendar_acceso='none', así
  // Maria sabe que no tiene calendar conectado todavía y se salta el flow F4
  // de onboarding de calendario.
  const sinCalendar = pending.calendar_provider === 'ninguno' || !pending.calendar_provider;
  const provider = sinCalendar ? 'google' : pending.calendar_provider;
  const acceso = sinCalendar ? 'none' : 'write';

  const idb = new Database(`/root/secretaria/state/${instance.slug}/db/maria.sqlite`);
  let usuarioId;
  try {
    const r = idb.prepare(`
      INSERT INTO usuarios (nombre, email, wa_cus, calendar_id, calendar_provider, calendar_acceso, rol, tz, activo, bienvenida_enviada, lemon_customer_id, lemon_subscription_id)
      VALUES (?, ?, ?, ?, ?, ?, 'usuario', 'America/Argentina/Buenos_Aires', 1, 0, ?, ?)
    `).run(
      pending.nombre,
      pending.email,
      `${pending.wa}@c.us`,
      sinCalendar ? null : pending.email,   // calendar_id null si no tiene calendar
      provider,
      acceso,
      customerId,
      subscriptionId,
    );
    usuarioId = r.lastInsertRowid;
  } finally {
    idb.close();
  }

  // Crear cliente en control
  c.prepare(`
    INSERT INTO clientes (
      nombre, email, wa, calendar_provider, instancia_slug, instancia_usuario_id, estado,
      lemon_customer_id, lemon_subscription_id, lemon_customer_portal,
      ultimo_cobro_en, proximo_cobro_en, ultimo_evento, ultimo_evento_en,
      terminos_aceptados_en, terminos_version
    ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?)
  `).run(
    pending.nombre, pending.email, pending.wa, pending.calendar_provider,
    instance.slug, usuarioId, customerId, subscriptionId, attrs.urls?.customer_portal || null,
    attrs.created_at, attrs.renews_at, 'subscription_created',
    pending.terminos_aceptados_en || new Date().toISOString(), 'v1-2026-05-19',
  );

  instances.incrementarUsuarios(instance.slug);
  c.prepare(`DELETE FROM signup_pending WHERE id=?`).run(pending.id);

  console.log(`[webhook] CLIENTE CREADO: ${pending.email} → ${instance.slug}/usuario_id=${usuarioId}`);
}

async function _crearClienteSinSignup(evt) {
  // Caso de fallback: alguien pagó sin haber pasado por el signup form de Intensa
  // (ej. compró desde un share link de LS). Lo registramos en `clientes` sin instancia
  // y avisamos al operador para resolución manual.
  const c = db.control();
  const data = evt.data;
  const attrs = data.attributes;
  c.prepare(`
    INSERT OR IGNORE INTO clientes (
      nombre, email, wa, instancia_slug, estado, lemon_customer_id, lemon_subscription_id, ultimo_evento, ultimo_evento_en
    ) VALUES (?, ?, ?, '_pending_assignment', 'inactive', ?, ?, 'subscription_created_no_signup', datetime('now'))
  `).run(
    attrs.user_name || 'sin nombre',
    attrs.user_email,
    'sin-wa-' + Date.now(),                 // placeholder — UNIQUE constraint requiere algo
    String(attrs.customer_id), String(data.id)
  );
  console.warn(`[webhook] cliente creado SIN signup_pending — revisar manual: ${attrs.user_email}`);
}

async function _onSubscriptionUpdated(evt) {
  const c = db.control();
  const subId = String(evt.data.id);
  c.prepare(`
    UPDATE clientes SET ultimo_evento='subscription_updated', ultimo_evento_en=datetime('now'),
      proximo_cobro_en=?, actualizado=datetime('now')
    WHERE lemon_subscription_id=?
  `).run(evt.data.attributes.renews_at || null, subId);
}

async function _onPaymentSuccess(evt) {
  const c = db.control();
  const subId = String(evt.data.attributes.subscription_id || evt.data.id);
  c.prepare(`
    UPDATE clientes SET
      estado=CASE WHEN estado='inactive' THEN 'active' ELSE estado END,
      ultimo_cobro_en=datetime('now'),
      proximo_cobro_en=?,
      ultimo_evento='payment_success', ultimo_evento_en=datetime('now'),
      inactivado_en=NULL,
      actualizado=datetime('now')
    WHERE lemon_subscription_id=?
  `).run(evt.data.attributes.renews_at || null, subId);
  // Si estaba inactive, reactivar usuario en su instancia
  _setActivoEnInstancia(subId, 1);
}

async function _onPaymentFailed(evt) {
  const c = db.control();
  const subId = String(evt.data.attributes.subscription_id || evt.data.id);
  c.prepare(`
    UPDATE clientes SET estado='inactive', inactivado_en=datetime('now'),
      ultimo_evento='payment_failed', ultimo_evento_en=datetime('now'),
      actualizado=datetime('now')
    WHERE lemon_subscription_id=?
  `).run(subId);
  _setActivoEnInstancia(subId, 0);
}

async function _onSubscriptionCancelled(evt) {
  const c = db.control();
  const subId = String(evt.data.id);
  c.prepare(`
    UPDATE clientes SET estado='cancelled', cancelado_en=datetime('now'),
      ultimo_evento='subscription_cancelled', ultimo_evento_en=datetime('now'),
      actualizado=datetime('now')
    WHERE lemon_subscription_id=?
  `).run(subId);
  _setActivoEnInstancia(subId, 0);
  // El borrado real (con archive) lo hace el cron diario a +90 días.
}

function _setActivoEnInstancia(lemonSubscriptionId, activo) {
  const c = db.control();
  const cli = c.prepare(`SELECT * FROM clientes WHERE lemon_subscription_id=?`).get(lemonSubscriptionId);
  if (!cli || !cli.instancia_slug || cli.instancia_slug === '_pending_assignment') return;
  const idb = new Database(`/root/secretaria/state/${cli.instancia_slug}/db/maria.sqlite`);
  try {
    idb.prepare(`UPDATE usuarios SET activo=? WHERE id=?`).run(activo, cli.instancia_usuario_id);
  } finally {
    idb.close();
  }
  if (activo === 0) instances.decrementarUsuarios(cli.instancia_slug);
  else instances.incrementarUsuarios(cli.instancia_slug);
}

module.exports = router;
