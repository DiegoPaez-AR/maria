// routes/webhook.js — POST /webhook (Stripe)
// Valida la firma 'stripe-signature', dedupea por event.id, procesa eventos de suscripción.

const express = require('express');
const db = require('../lib/db');
const instances = require('../lib/instances');
const mariaRpc = require('../lib/maria-rpc');
const stripe = require('../lib/stripe');
const Database = require('better-sqlite3');

const router = express.Router();
// El body llega crudo (Buffer) gracias a express.raw() montado en index.js
// antes de este router — necesario para validar la firma de Stripe.

router.post('/', async (req, res, next) => {
  try {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) {
      console.error('[webhook] STRIPE_WEBHOOK_SECRET no configurado — rechazando por seguridad');
      return res.status(503).json({ error: 'webhook_not_configured' });
    }
    const sig = req.headers['stripe-signature'];
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));

    let evt;
    try {
      evt = stripe.verifyWebhook(rawBody, sig, secret);
    } catch (sigErr) {
      console.warn(`[webhook] firma inválida: ${sigErr.message}`);
      return res.status(sigErr.status || 401).json({ error: 'invalid_signature' });
    }

    const eventName = evt.type;
    const eventId = evt.id;
    if (!eventName || !eventId) return res.status(400).json({ error: 'malformed_event' });

    // Dedupe por event.id (Stripe reintenta el mismo evento ante 5xx/timeout).
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

    try {
      await _procesar(eventName, evt);
      c.prepare(`UPDATE webhook_events SET procesado=1, procesado_en=datetime('now') WHERE ls_event_id=?`).run(eventId);
      res.json({ ok: true });
    } catch (procErr) {
      c.prepare(`UPDATE webhook_events SET error=? WHERE ls_event_id=?`).run(procErr.message, eventId);
      console.error(`[webhook] error procesando ${eventName} (${eventId}):`, procErr.stack || procErr);
      res.status(500).json({ error: 'processing_failed' }); // 5xx → Stripe reintenta
    }
  } catch (err) {
    next(err);
  }
});

async function _procesar(eventName, evt) {
  const obj = evt.data?.object || {};
  console.log(`[webhook] ${eventName} obj=${obj.id || '?'}`);

  switch (eventName) {
    case 'checkout.session.completed':
      return _onCheckoutCompleted(obj);
    case 'customer.subscription.updated':
      return _onSubscriptionUpdated(obj);
    case 'invoice.payment_succeeded':
    case 'invoice.paid':
      return _onPaymentSuccess(obj);
    case 'invoice.payment_failed':
      return _onPaymentFailed(obj);
    case 'customer.subscription.deleted':
      return _onSubscriptionCancelled(obj);
    default:
      console.log(`[webhook] evento ${eventName} sin handler — guardado y marcado OK`);
  }
}

// current_period_end puede venir en el top-level (API vieja) o en el primer
// item de la suscripción (API nueva). Devolvemos unix segs o null.
function _subPeriodEnd(sub) {
  if (!sub) return null;
  return sub.current_period_end || sub.items?.data?.[0]?.current_period_end || null;
}

async function _onCheckoutCompleted(session) {
  // Solo nos interesan los checkouts de suscripción que quedaron pagos.
  if (session.mode && session.mode !== 'subscription') {
    console.log(`[webhook] checkout.session.completed mode=${session.mode} — ignorado`);
    return;
  }
  const c = db.control();
  const signupToken = session.metadata?.signup_token || session.client_reference_id || null;
  const customerId = session.customer ? String(session.customer) : null;
  const subscriptionId = session.subscription ? String(session.subscription) : null;
  const email = session.customer_details?.email || session.customer_email || null;

  console.log(`[webhook] checkout completado: email=${email} sub=${subscriptionId} signup_token=${signupToken ? signupToken.slice(0, 8) + '…' : '(none)'}`);

  // Datos de la suscripción para próximo cobro (best-effort).
  let proximoCobro = null;
  if (subscriptionId) {
    try {
      const sub = await stripe.api('GET', `/subscriptions/${subscriptionId}`);
      proximoCobro = stripe.unixToIso(_subPeriodEnd(sub));
    } catch (e) {
      console.warn(`[webhook] no pude leer subscription ${subscriptionId}: ${e.message}`);
    }
  }

  let pending = null;
  if (signupToken) pending = c.prepare(`SELECT * FROM signup_pending WHERE signup_token=?`).get(signupToken);
  if (!pending) {
    console.warn(`[webhook] checkout sin signup_pending (token=${signupToken}, email=${email}) — fallback`);
    return _crearClienteSinSignup({ email, name: session.customer_details?.name, customerId, subscriptionId });
  }

  const instance = instances.assignBestInstance();
  if (!instance) throw new Error('No hay instancia con cupo disponible. Cliente queda sin asignar — revisar manual.');

  const sinCalendar = pending.calendar_provider === 'ninguno' || !pending.calendar_provider;
  const provider = sinCalendar ? 'google' : pending.calendar_provider;
  const acceso = sinCalendar ? 'none' : 'write';
  const waCus = `${pending.wa}@c.us`;

  const idb = new Database(`/root/secretaria/state/${instance.slug}/db/maria.sqlite`);
  let usuarioId;
  let debeBienvenida = true;
  try {
    const yaUsuario = idb.prepare(`SELECT id, activo, bienvenida_enviada FROM usuarios WHERE email=? OR wa_cus=? LIMIT 1`)
      .get(pending.email, waCus);

    let nombreFinal = pending.nombre;
    const duenoNombre = idb.prepare(`SELECT id FROM usuarios WHERE nombre=? LIMIT 1`).get(pending.nombre);
    if (duenoNombre && (!yaUsuario || duenoNombre.id !== yaUsuario.id)) {
      nombreFinal = `${pending.nombre} ${String(pending.wa).slice(-4)}`;
    }

    if (yaUsuario && yaUsuario.activo) {
      usuarioId = yaUsuario.id;
      debeBienvenida = !yaUsuario.bienvenida_enviada;
      console.log(`[webhook] usuario ya existía activo en ${instance.slug} (id=${usuarioId}), reuso`);
    } else if (yaUsuario) {
      idb.prepare(`
        UPDATE usuarios SET activo=1, bienvenida_enviada=0, nombre=?, email=?, wa_cus=?,
          calendar_id=?, calendar_provider=?, calendar_acceso=?, idioma=?
        WHERE id=?
      `).run(
        nombreFinal, pending.email, waCus,
        sinCalendar ? null : pending.email, provider, acceso, (pending.idioma === 'en' ? 'en' : 'es'),
        yaUsuario.id,
      );
      usuarioId = yaUsuario.id;
      console.log(`[webhook] usuario reactivado en ${instance.slug} (id=${usuarioId})`);
    } else {
      try {
        const r = idb.prepare(`
          INSERT INTO usuarios (nombre, email, wa_cus, calendar_id, calendar_provider, calendar_acceso, rol, tz, idioma, activo, bienvenida_enviada)
          VALUES (?, ?, ?, ?, ?, ?, 'usuario', 'America/Argentina/Buenos_Aires', ?, 1, 0)
        `).run(
          nombreFinal, pending.email, waCus,
          sinCalendar ? null : pending.email, provider, acceso,
          (pending.idioma === 'en' ? 'en' : 'es'),
        );
        usuarioId = r.lastInsertRowid;
      } catch (insErr) {
        const otra = idb.prepare(`SELECT id FROM usuarios WHERE email=? OR wa_cus=? LIMIT 1`).get(pending.email, waCus);
        if (!otra) throw insErr;
        idb.prepare(`UPDATE usuarios SET activo=1 WHERE id=?`).run(otra.id);
        usuarioId = otra.id;
        console.warn(`[webhook] INSERT usuario chocó (${insErr.message}) — reuso id=${usuarioId}`);
      }
    }
  } finally {
    idb.close();
  }

  // Upsert cliente en control con ids de Stripe.
  const cliExist = c.prepare(`SELECT id, estado FROM clientes WHERE email=? OR wa=? LIMIT 1`).get(pending.email, pending.wa);
  const clienteYaActivo = !!(cliExist && cliExist.estado === 'active');
  if (cliExist) {
    c.prepare(`
      UPDATE clientes SET
        nombre=?, email=?, wa=?, calendar_provider=?, instancia_slug=?, instancia_usuario_id=?,
        estado='active', stripe_customer_id=?, stripe_subscription_id=?,
        ultimo_cobro_en=datetime('now'), proximo_cobro_en=?,
        ultimo_evento='checkout_completed', ultimo_evento_en=datetime('now'),
        inactivado_en=NULL, cancelado_en=NULL,
        terminos_aceptados_en=?, terminos_version=?, actualizado=datetime('now')
      WHERE id=?
    `).run(
      pending.nombre, pending.email, pending.wa, pending.calendar_provider,
      instance.slug, usuarioId, customerId, subscriptionId, proximoCobro,
      pending.terminos_aceptados_en || new Date().toISOString(), 'v1-2026-05-19',
      cliExist.id,
    );
    console.log(`[webhook] cliente existente (id=${cliExist.id}, estado=${cliExist.estado}) → active`);
  } else {
    c.prepare(`
      INSERT INTO clientes (
        nombre, email, wa, calendar_provider, instancia_slug, instancia_usuario_id, estado,
        stripe_customer_id, stripe_subscription_id,
        ultimo_cobro_en, proximo_cobro_en, ultimo_evento, ultimo_evento_en,
        terminos_aceptados_en, terminos_version
      ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, datetime('now'), ?, 'checkout_completed', datetime('now'), ?, ?)
    `).run(
      pending.nombre, pending.email, pending.wa, pending.calendar_provider,
      instance.slug, usuarioId, customerId, subscriptionId, proximoCobro,
      pending.terminos_aceptados_en || new Date().toISOString(), 'v1-2026-05-19',
    );
  }

  if (!clienteYaActivo) instances.incrementarUsuarios(instance.slug);

  if (debeBienvenida) {
    const asistente = instance.asistente || 'Maria';
    const msg = (pending.idioma === 'en')
      ? `Hi ${pending.nombre}! I'm ${asistente}, your new personal assistant. Your sign-up is confirmed ✅\n\nYou can message me right here for whatever you need: scheduling meetings, reminders, coordinating with others, transcribing audio and more.\n\nTo get started: which calendar do you use? (Google / Outlook / iCloud / other) I'll walk you through connecting it and start taking care of your agenda.`
      : `¡Hola ${pending.nombre}! Soy ${asistente}, tu nueva secretaria personal. Tu alta quedó confirmada ✅\n\nYa podés escribirme por acá para lo que necesites: agendar reuniones, recordatorios, coordinar con terceros, transcribir audios y más.\n\nPara arrancar: ¿qué calendario usás? (Google / Outlook / iCloud / otro) Así te paso los pasos para conectarlo y empiezo a cuidarte la agenda.`;
    try {
      await mariaRpc.sendWa(instance, { to: pending.wa, body: msg });
      const idb2 = new Database(`/root/secretaria/state/${instance.slug}/db/maria.sqlite`);
      try { idb2.prepare(`UPDATE usuarios SET bienvenida_enviada=1 WHERE id=?`).run(usuarioId); }
      finally { idb2.close(); }
      console.log(`[webhook] bienvenida enviada a ${pending.wa} via ${instance.slug}`);
    } catch (waErr) {
      console.error(`[webhook] bienvenida a ${pending.wa} falló (bienvenida_enviada=0): ${waErr.message}`);
    }
  }

  c.prepare(`DELETE FROM signup_pending WHERE id=?`).run(pending.id);
  console.log(`[webhook] CLIENTE CREADO: ${pending.email} → ${instance.slug}/usuario_id=${usuarioId}`);
}

async function _crearClienteSinSignup({ email, name, customerId, subscriptionId }) {
  // Fallback: pago sin signup_token (link directo o limpieza del pending).
  // Queda inactive hasta que un humano confirme y setee el WA.
  const c = db.control();
  const instance = instances.assignBestInstance();
  if (!instance) throw new Error('No hay instancia con cupo disponible para fallback.');
  const waPlaceholder = `_pending_${customerId || subscriptionId || Date.now()}`;
  try {
    c.prepare(`
      INSERT OR IGNORE INTO clientes (
        nombre, email, wa, instancia_slug, estado,
        stripe_customer_id, stripe_subscription_id,
        ultimo_evento, ultimo_evento_en, terminos_aceptados_en, terminos_version
      ) VALUES (?, ?, ?, ?, 'inactive', ?, ?, 'checkout_completed_no_signup', datetime('now'), datetime('now'), 'v1-2026-05-19')
    `).run(name || 'sin nombre', email, waPlaceholder, instance.slug, customerId, subscriptionId);
    console.warn(`[webhook] cliente FALLBACK creado en ${instance.slug} (inactive) para ${email} — necesita resolución manual del WA`);
  } catch (err) {
    console.error(`[webhook] fallback INSERT falló: ${err.message}`);
    throw err;
  }
}

async function _onSubscriptionUpdated(sub) {
  const c = db.control();
  const subId = String(sub.id);
  c.prepare(`
    UPDATE clientes SET ultimo_evento='subscription_updated', ultimo_evento_en=datetime('now'),
      proximo_cobro_en=?, actualizado=datetime('now')
    WHERE stripe_subscription_id=?
  `).run(stripe.unixToIso(_subPeriodEnd(sub)), subId);
}

async function _onPaymentSuccess(invoice) {
  const c = db.control();
  const subId = invoice.subscription ? String(invoice.subscription) : null;
  if (!subId) return;
  let proximo = stripe.unixToIso(invoice.lines?.data?.[0]?.period?.end || invoice.period_end);
  if (!proximo) {
    try { proximo = stripe.unixToIso(_subPeriodEnd(await stripe.api('GET', `/subscriptions/${subId}`))); }
    catch (e) { console.warn(`[webhook] no pude leer sub ${subId} para proximo_cobro: ${e.message}`); }
  }
  c.prepare(`
    UPDATE clientes SET
      estado=CASE WHEN estado='inactive' THEN 'active' ELSE estado END,
      ultimo_cobro_en=datetime('now'),
      proximo_cobro_en=COALESCE(?, proximo_cobro_en),
      ultimo_evento='payment_success', ultimo_evento_en=datetime('now'),
      inactivado_en=NULL, actualizado=datetime('now')
    WHERE stripe_subscription_id=?
  `).run(proximo, subId);
  _setActivoEnInstancia(subId, 1);
}

async function _onPaymentFailed(invoice) {
  const c = db.control();
  const subId = invoice.subscription ? String(invoice.subscription) : null;
  if (!subId) return;
  c.prepare(`
    UPDATE clientes SET estado='inactive', inactivado_en=datetime('now'),
      ultimo_evento='payment_failed', ultimo_evento_en=datetime('now'), actualizado=datetime('now')
    WHERE stripe_subscription_id=?
  `).run(subId);
  _setActivoEnInstancia(subId, 0);
}

async function _onSubscriptionCancelled(sub) {
  const c = db.control();
  const subId = String(sub.id);
  c.prepare(`
    UPDATE clientes SET estado='cancelled', cancelado_en=datetime('now'),
      ultimo_evento='subscription_cancelled', ultimo_evento_en=datetime('now'), actualizado=datetime('now')
    WHERE stripe_subscription_id=?
  `).run(subId);
  _setActivoEnInstancia(subId, 0);
  // El borrado real (con archive) lo hace el cron diario a +90 días.
}

function _setActivoEnInstancia(stripeSubscriptionId, activo) {
  const c = db.control();
  const cli = c.prepare(`SELECT * FROM clientes WHERE stripe_subscription_id=?`).get(stripeSubscriptionId);
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
