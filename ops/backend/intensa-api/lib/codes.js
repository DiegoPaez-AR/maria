// codes.js — códigos OTP de 6 dígitos numéricos, generación y validación.

const crypto = require('crypto');
const db = require('./db');
const mariaRpc = require('./maria-rpc');
const instances = require('./instances');

const TTL_MIN = 10;
const MAX_INTENTOS = 5;
const CODE_LEN = 6;

function generarCodigo() {
  // 6 dígitos, sin patrones obvios. Usamos crypto.
  let s = '';
  while (s.length < CODE_LEN) {
    s += crypto.randomInt(0, 10).toString();
  }
  return s;
}

/**
 * Inicia signup: genera 2 códigos (email + WA), los persiste en signup_pending,
 * y los envía vía la Maria "signup_bot".
 */
function iniciarSignup({ nombre, email, wa, calendar_provider, idioma }) {
  const idiomaN = idioma === 'en' ? 'en' : 'es';
  if (!nombre || !email || !wa) throw new Error('iniciarSignup: faltan campos');
  const c = db.control();

  // Si ya existe un signup_pending fresco para este email/wa, reutilizarlo si está
  // dentro del TTL. Si expiró, limpiarlo.
  const ahora = new Date();
  c.prepare(`DELETE FROM signup_pending WHERE expira_en < datetime('now')`).run();

  // Si ya hay un cliente activo con ese email o wa, abortar.
  const yaCliente = c.prepare(`SELECT estado FROM clientes WHERE email=? OR wa=? LIMIT 1`).get(email, wa);
  if (yaCliente) {
    if (yaCliente.estado === 'active') {
      const err = new Error('Ya hay una suscripción activa con este email o WhatsApp.');
      err.code = 'already_active';
      err.status = 409;
      throw err;
    }
  }

  // Existing pending → reutilizar (no spamear códigos nuevos).
  const exist = c.prepare(`SELECT * FROM signup_pending WHERE email=? OR wa=? ORDER BY id DESC LIMIT 1`).get(email, wa);
  if (exist) {
    // si todavía válido y pertenece al mismo email+wa exacto, REENVIAR los
    // códigos existentes (no generar nuevos → no invalida los ya enviados).
    // Antes (bug pre-2026-06-13) retornaba sin reenviar: el usuario que tocaba
    // "Reenviar" no recibía nada pero la UI decía "reenviado".
    if (exist.email === email && exist.wa === wa) {
      // Throttle anti-spam: máx 1 reenvío cada REENVIO_THROTTLE_S por signup.
      const ultimoMs = exist.reenviado_en ? new Date(exist.reenviado_en + 'Z').getTime() : 0;
      const throttleMs = Number(process.env.SIGNUP_REENVIO_THROTTLE_S || 60) * 1000;
      if (Date.now() - ultimoMs >= throttleMs) {
        c.prepare(`UPDATE signup_pending SET reenviado_en=datetime('now'), terminos_aceptados_en=datetime('now') WHERE id=?`).run(exist.id);
        _enviarCodigos({ nombre: exist.nombre, email: exist.email, wa: exist.wa, email_code: exist.email_code, wa_code: exist.wa_code });
      } else {
        console.log(`[codes] reenvío throttleado para signup id=${exist.id} (esperá ${Math.ceil((throttleMs - (Date.now()-ultimoMs))/1000)}s)`);
      }
      return { signup_id: exist.id, reutilizado: true };
    }
    // Otherwise, conflict: el email está usado con otro wa (o viceversa).
    c.prepare(`DELETE FROM signup_pending WHERE id=?`).run(exist.id);
  }

  const email_code = generarCodigo();
  const wa_code = generarCodigo();
  const expira = new Date(ahora.getTime() + TTL_MIN * 60_000).toISOString();

  const r = c.prepare(`
    INSERT INTO signup_pending (nombre, email, wa, calendar_provider, idioma, email_code, wa_code, expira_en, terminos_aceptados_en)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(nombre, email, wa, calendar_provider || null, idiomaN, email_code, wa_code, expira);

  console.log(`[codes] signup_pending id=${r.lastInsertRowid} email=${email} wa=${wa}`);
  _enviarCodigos({ nombre, email, wa, email_code, wa_code });
  return { signup_id: r.lastInsertRowid, reutilizado: false };
}

/**
 * Verifica códigos. Devuelve signup_token si los DOS son correctos.
 */
function verificarSignup({ signup_id, email_code, wa_code }) {
  const c = db.control();
  const row = c.prepare(`SELECT * FROM signup_pending WHERE id=?`).get(signup_id);
  if (!row) {
    const e = new Error('Sesión de signup no encontrada o expirada.');
    e.code = 'signup_not_found'; e.status = 404;
    throw e;
  }
  if (new Date(row.expira_en) < new Date()) {
    c.prepare(`DELETE FROM signup_pending WHERE id=?`).run(signup_id);
    const e = new Error('La sesión de signup expiró. Empezá de nuevo.');
    e.code = 'signup_expired'; e.status = 410;
    throw e;
  }

  // Validar cada código por separado, contar intentos
  let email_ok = !!row.email_verified;
  let wa_ok = !!row.wa_verified;
  let cambios = {};

  if (!email_ok && email_code) {
    if (row.email_intentos >= MAX_INTENTOS) {
      const e = new Error('Máximo de intentos alcanzado para el código de email.');
      e.code = 'email_max_intentos'; e.status = 429;
      throw e;
    }
    if (email_code === row.email_code) {
      email_ok = true;
      cambios.email_verified = 1;
    } else {
      cambios.email_intentos = row.email_intentos + 1;
    }
  }
  if (!wa_ok && wa_code) {
    if (row.wa_intentos >= MAX_INTENTOS) {
      const e = new Error('Máximo de intentos alcanzado para el código de WhatsApp.');
      e.code = 'wa_max_intentos'; e.status = 429;
      throw e;
    }
    if (wa_code === row.wa_code) {
      wa_ok = true;
      cambios.wa_verified = 1;
    } else {
      cambios.wa_intentos = row.wa_intentos + 1;
    }
  }

  if (Object.keys(cambios).length) {
    const sets = Object.keys(cambios).map(k => `${k}=?`).join(', ');
    const vals = Object.values(cambios);
    c.prepare(`UPDATE signup_pending SET ${sets} WHERE id=?`).run(...vals, signup_id);
  }

  if (email_ok && wa_ok) {
    // Emitir signup_token (random 32 bytes hex). Se persiste en la fila;
    // el webhook lo va a buscar al recibir el subscription_created.
    let token = row.signup_token;
    if (!token) {
      token = crypto.randomBytes(32).toString('hex');
      // Al emitir el token extendemos el TTL a ahora+30min: el checkout de LS
      // tarda más que los 10min originales del pending (schema.sql ya prometía
      // 30min post-verificación; recién acá se cumple).
      c.prepare(`UPDATE signup_pending SET signup_token=?, token_emitido_en=datetime('now'), expira_en=datetime('now', '+30 minutes') WHERE id=?`)
        .run(token, signup_id);
    }
    return { ok: true, email_verified: true, wa_verified: true, signup_token: token };
  }

  return { ok: false, email_verified: email_ok, wa_verified: wa_ok };
}

function _enviarCodigos({ nombre, email, wa, email_code, wa_code }) {
  const bot = instances.signupBot();
  if (!bot) {
    throw new Error('No hay instancia con signup_bot=1. Configurar al menos una Maria como signup_bot.');
  }
  const emailBody = _renderEmailVerificacion({ nombre, code: email_code });
  const waBody = _renderWaVerificacion({ nombre, code: wa_code });
  // Best-effort en paralelo; si uno falla se loggea pero no rompe el flujo.
  mariaRpc.sendEmail(bot, { to: email, subject: 'Tu código para suscribirte a María', html: emailBody })
    .catch(err => console.error(`[codes] sendEmail failed:`, err.message));
  mariaRpc.sendWa(bot, { to: wa, body: waBody })
    .catch(err => console.error(`[codes] sendWa failed:`, err.message));
}

function _renderEmailVerificacion({ nombre, code }) {
  return `<!DOCTYPE html>
<html><body style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 24px auto; color: #1a1a1a;">
  <p>Hola ${escapeHtml(nombre)},</p>
  <p>Soy María. Para verificar tu email y completar la suscripción, ingresá este código:</p>
  <p style="font-size: 32px; font-weight: 600; letter-spacing: 8px; background: #faf7f2; padding: 16px 24px; border-radius: 12px; display: inline-block;">${code}</p>
  <p>Vence en 10 minutos.</p>
  <p>Si no estás iniciando una suscripción a María, ignorá este mensaje.</p>
  <p style="color: #888; font-size: 12px;">María — tu secretaria personal con IA.</p>
</body></html>`;
}

function _renderWaVerificacion({ nombre, code }) {
  return `Hola ${nombre}, soy María 👋\n\nTu código de verificación de WhatsApp es:\n\n*${code}*\n\nVence en 10 minutos. Si no estás iniciando una suscripción, ignorá este mensaje.`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function startCleanupLoop() {
  setInterval(() => {
    try {
      const c = db.control();
      const r1 = c.prepare(`DELETE FROM signup_pending WHERE expira_en < datetime('now')`).run();
      const r2 = c.prepare(`DELETE FROM portal_otp WHERE expira_en < datetime('now')`).run();
      const r3 = c.prepare(`DELETE FROM portal_sessions WHERE expira_en < datetime('now')`).run();
      if (r1.changes + r2.changes + r3.changes > 0) {
        console.log(`[codes] cleanup: signup=${r1.changes} otp=${r2.changes} sessions=${r3.changes}`);
      }
    } catch (err) {
      console.error('[codes] cleanup error:', err.message);
    }
  }, 60_000);
}

module.exports = { iniciarSignup, verificarSignup, startCleanupLoop };
