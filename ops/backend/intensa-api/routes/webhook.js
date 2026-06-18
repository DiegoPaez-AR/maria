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
// NO usamos express.json acá — el body ya viene crudo (Buffer) gracias al
// express.raw() montado en index.js antes de este router.

router.post('/', async (req, res, next) => {
  try {
    const secret = process.env.LEMON_WEBHOOK_SECRET;
    if (!secret) {
      console.error('[webhook] LEMON_WEBHOOK_SECRET no configurado — rechazando webhook por seguridad');
      return res.status(503).json({ error: 'webhook_not_configured' });
    }
    const sig = req.headers['x-signature'];
    if (!sig) return res.status(401).json({ error: 'missing_signature' });

    // req.body es Buffer (raw) gracias a express.raw() en index.js.
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));

    // Validar HMAC-SHA256 del body crudo con secret
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    const sigBuf = Buffer.from(String(sig), 'utf8');
    const expBuf = Buffer.from(expected, 'utf8');
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      console.warn(`[webhook] firma inválida (got=${String(sig).slice(0,12)}… expected=${expected.slice(0,12)}…)`);
      return res.status(401).json({ error: 'invalid_signature' });
    }

    let evt;
    try {
      evt = JSON.parse(rawBody.toString('utf8'));
    } catch (parseErr) {
      console.error('[webhook] body no parsea como JSON:', parseErr.message);
      return res.status(400).json({ error: 'invalid_json' });
    }
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

  const waCus = `${pending.wa}@c.us`;
  const idb = new Database(`/root/secretaria/state/${instance.slug}/db/maria.sqlite`);
  let usuarioId;
  let debeBienvenida = true;
  try {
    // Idempotencia: los UNIQUE de `usuarios` (nombre, email, wa_cus) son globales
    // e incluyen filas con activo=0 — un retry del webhook o un ex-cliente que
    // vuelve no puede ir derecho al INSERT.
    const yaUsuario = idb.prepare(`SELECT id, activo, bienvenida_enviada FROM usuarios WHERE email=? OR wa_cus=? LIMIT 1`)
      .get(pending.email, waCus);

    // Si el nombre lo tiene OTRO usuario (nombre es UNIQUE), desambiguamos con
    // los últimos 4 dígitos del wa.
    let nombreFinal = pending.nombre;
    const duenoNombre = idb.prepare(`SELECT id FROM usuarios WHERE nombre=? LIMIT 1`).get(pending.nombre);
    if (duenoNombre && (!yaUsuario || duenoNombre.id !== yaUsuario.id)) {
      nombreFinal = `${pending.nombre} ${String(pending.wa).slice(-4)}`;
    }

    if (yaUsuario && yaUsuario.activo) {
      // Ya existía ACTIVO con este email/wa (retry del webhook) → reusamos.
      usuarioId = yaUsuario.id;
      debeBienvenida = !yaUsuario.bienvenida_enviada;
      console.log(`[webhook] usuario ya existía activo en ${instance.slug} (id=${usuarioId}), reuso sin insertar`);
    } else if (yaUsuario) {
      // Existía INACTIVO (ex-cliente que vuelve) → reactivamos y refrescamos datos.
      idb.prepare(`
        UPDATE usuarios SET activo=1, bienvenida_enviada=0, nombre=?, email=?, wa_cus=?,
          calendar_id=?, calendar_provider=?, calendar_acceso=?, idioma=?,
          lemon_customer_id=?, lemon_subscription_id=?
        WHERE id=?
      `).run(
        nombreFinal, pending.email, waCus,
        sinCalendar ? null : pending.email, provider, acceso, (pending.idioma === 'en' ? 'en' : 'es'),
        customerId, subscriptionId, yaUsuario.id,
      );
      usuarioId = yaUsuario.id;
      console.log(`[webhook] usuario reactivado en ${instance.slug} (id=${usuarioId})`);
    } else {
      try {
        const r = idb.prepare(`
          INSERT INTO usuarios (nombre, email, wa_cus, calendar_id, calendar_provider, calendar_acceso, rol, tz, idioma, activo, bienvenida_enviada, lemon_customer_id, lemon_subscription_id)
          VALUES (?, ?, ?, ?, ?, ?, 'usuario', 'America/Argentina/Buenos_Aires', ?, 1, 0, ?, ?)
        `).run(
          nombreFinal,
          pending.email,
          waCus,
          sinCalendar ? null : pending.email,   // calendar_id null si no tiene calendar
          provider,
          acceso,
          (pending.idioma === 'en' ? 'en' : 'es'),
          customerId,
          subscriptionId,
        );
        usuarioId = r.lastInsertRowid;
      } catch (insErr) {
        // Constraint inesperado (carrera u otro UNIQUE): re-buscamos por email/wa
        // y reusamos si apareció, así el flujo no queda a medias y un retry cierra bien.
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

  // Crear/actualizar cliente en control (upsert-style: email/wa/subscription_id
  // son UNIQUE, un INSERT ciego revienta ante retry o ex-cliente que vuelve).
  const cliExist = c.prepare(`SELECT id, estado FROM clientes WHERE email=? OR wa=? LIMIT 1`).get(pending.email, pending.wa);
  const clienteYaActivo = !!(cliExist && cliExist.estado === 'active');
  if (cliExist) {
    // Existía (inactive/cancelled, o active si es retry del mismo evento) →
    // lo dejamos activo y refrescamos ids de LS, instancia y demás campos.
    c.prepare(`
      UPDATE clientes SET
        nombre=?, email=?, wa=?, calendar_provider=?, instancia_slug=?, instancia_usuario_id=?,
        estado='active', lemon_customer_id=?, lemon_subscription_id=?, lemon_customer_portal=?,
        ultimo_cobro_en=?, proximo_cobro_en=?, ultimo_evento='subscription_created', ultimo_evento_en=datetime('now'),
        inactivado_en=NULL, cancelado_en=NULL,
        terminos_aceptados_en=?, terminos_version=?, actualizado=datetime('now')
      WHERE id=?
    `).run(
      pending.nombre, pending.email, pending.wa, pending.calendar_provider,
      instance.slug, usuarioId, customerId, subscriptionId, attrs.urls?.customer_portal || null,
      attrs.created_at, attrs.renews_at,
      pending.terminos_aceptados_en || new Date().toISOString(), 'v1-2026-05-19',
      cliExist.id,
    );
    console.log(`[webhook] cliente existente (id=${cliExist.id}, estado=${cliExist.estado}) → active`);
  } else {
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
  }

  // Solo sumamos cupo si el cliente NO estaba ya activo (retry no doble-cuenta).
  if (!clienteYaActivo) instances.incrementarUsuarios(instance.slug);

  // Bienvenida al que pagó: best-effort, sale por el internal-api de la
  // instancia ASIGNADA. Si falla, loggeamos y NO rompemos el alta
  // (bienvenida_enviada queda en 0 para reintentar después).
  if (debeBienvenida) {
    const asistente = instance.asistente || 'Maria'; // instances hoy no tiene nombre de asistente propio → default
    const msg = (pending.idioma === 'en')
      ? `Hi ${pending.nombre}! I'm ${asistente}, your new personal assistant. Your sign-up is confirmed ✅\n\nYou can message me right here for whatever you need: scheduling meetings, reminders, coordinating with others, transcribing audio and more.\n\nTo get started: which calendar do you use? (Google / Outlook / iCloud / other) I'll walk you through connecting it and start taking care of your agenda.`
      : `¡Hola ${pending.nombre}! Soy ${asistente}, tu nueva secretaria personal. Tu alta quedó confirmada ✅\n\nYa podés escribirme por acá para lo que necesites: agendar reuniones, recordatorios, coordinar con terceros, transcribir audios y más.\n\nPara arrancar: ¿qué calendario usás? (Google / Outlook / iCloud / otro) Así te paso los pasos para conectarlo y empiezo a cuidarte la agenda.`;
    try {
      await mariaRpc.sendWa(instance, { to: pending.wa, body: msg });
      const idb2 = new Database(`/root/secretaria/state/${instance.slug}/db/maria.sqlite`);
      try {
        idb2.prepare(`UPDATE usuarios SET bienvenida_enviada=1 WHERE id=?`).run(usuarioId);
      } finally {
        idb2.close();
      }
      console.log(`[webhook] bienvenida enviada a ${pending.wa} via ${instance.slug}`);
    } catch (waErr) {
      console.error(`[webhook] bienvenida a ${pending.wa} falló (queda bienvenida_enviada=0): ${waErr.message}`);
    }
  }

  c.prepare(`DELETE FROM signup_pending WHERE id=?`).run(pending.id);

  console.log(`[webhook] CLIENTE CREADO: ${pending.email} → ${instance.slug}/usuario_id=${usuarioId}`);
}

async function _crearClienteSinSignup(evt) {
  // Caso de fallback: el signup_token expiró o no matchea (ej. limpieza manual,
  // o el cliente compró por un share link de LS sin pasar por nuestro signup).
  // Hacemos best-effort: tomamos el email del payload de LS, asignamos a la
  // instancia con más cupo, dejamos `inactive` para que un humano confirme y
  // setee el WA antes de activar el usuario.
  const c = db.control();
  const data = evt.data;
  const attrs = data.attributes;
  const subscriptionId = String(data.id);
  const customerId = String(attrs.customer_id);
  const instance = instances.assignBestInstance();
  if (!instance) {
    console.warn(`[webhook] sin instancia disponible para fallback de ${attrs.user_email} — abortando creación`);
    throw new Error('No hay instancia con cupo disponible para fallback.');
  }
  // wa placeholder único para no violar UNIQUE (NULL no se puede en columna NOT NULL).
  const waPlaceholder = `_pending_${customerId}`;
  try {
    c.prepare(`
      INSERT OR IGNORE INTO clientes (
        nombre, email, wa, instancia_slug, estado,
        lemon_customer_id, lemon_subscription_id, lemon_customer_portal,
        ultimo_evento, ultimo_evento_en,
        terminos_aceptados_en, terminos_version
      ) VALUES (?, ?, ?, ?, 'inactive', ?, ?, ?, 'subscription_created_no_signup', datetime('now'), datetime('now'), 'v1-2026-05-19')
    `).run(
      attrs.user_name || 'sin nombre',
      attrs.user_email,
      waPlaceholder,
      instance.slug,
      customerId,
      subscriptionId,
      attrs.urls?.customer_portal || null,
    );
    console.warn(`[webhook] cliente FALLBACK creado en ${instance.slug} (inactive) para ${attrs.user_email} — necesita resolución manual del WA antes de activar`);
  } catch (err) {
    console.error(`[webhook] fallback INSERT falló: ${err.message}`);
    throw err;
  }
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
