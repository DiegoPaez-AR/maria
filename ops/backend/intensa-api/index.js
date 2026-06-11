// intensa-api — control plane para signup/checkout/webhook + portal de cuenta.
// Es un servicio separado de cada Maria; sirve a TODAS las instancias.
//
// Endpoints (montados bajo el prefijo /maria/api por NGINX):
//   POST /signup/start     → genera 2 códigos, manda email + WA
//   POST /signup/verify    → valida códigos, devuelve URL de checkout LS
//   POST /webhook          → recibe webhooks de LemonSqueezy
//   POST /cuenta/login     → pide código por email o WA (passwordless)
//   POST /cuenta/verify    → valida código, devuelve session cookie
//   GET  /cuenta/me        → datos del cliente logueado
//   POST /cuenta/reauth-code → manda OTP fresco para confirmar operación sensible
//   POST /cuenta/update    → cambiar email o WA (requiere OTP fresco)
//   POST /cuenta/cancel    → cancela suscripción (requiere OTP fresco)

const express = require('express');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const path = require('path');

const dotenv = (() => {
  try { return require('dotenv').config(); } catch { return null; }
})();

const db = require('./lib/db');
const codes = require('./lib/codes');
const instances = require('./lib/instances');
const mariaRpc = require('./lib/maria-rpc');

const PORT = Number(process.env.INTENSA_API_PORT || 4080);
const HOST = process.env.INTENSA_API_HOST || '127.0.0.1';

const app = express();
// Logger mínimo (antes de los parsers para no perder timing)
app.use((req, res, next) => {
  const t = Date.now();
  res.on('finish', () => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} → ${res.statusCode} ${Date.now()-t}ms`);
  });
  next();
});

// ⚠ Webhook PRIMERO con express.raw() para capturar el body como Buffer
// (necesario para validar HMAC). El router de webhook va antes del json parser
// global, así NO se consume el stream antes de tener el rawBody.
app.use('/webhook', express.raw({ type: 'application/json', limit: '256kb' }), require('./routes/webhook'));

// Para todos los demás endpoints: JSON parser normal.
app.use(express.json({ limit: '256kb' }));
app.use(cookieParser());

// Health
app.get('/health', (req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// Routes
app.use('/signup', require('./routes/signup'));
app.use('/cuenta', require('./routes/cuenta'));

// 404 handler
app.use((req, res) => res.status(404).json({ error: 'not_found', path: req.path }));

// Error handler
app.use((err, req, res, next) => {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.stack || err);
  res.status(err.status || 500).json({
    error: err.code || 'internal_error',
    message: err.message,
    // motivo: detalle opcional (ej. otp_required → 'faltante' | 'vencido' | 'invalido')
    ...(err.motivo ? { motivo: err.motivo } : {}),
  });
});

// Boot
db.init();
instances.bootstrapIfNeeded();
codes.startCleanupLoop();

app.listen(PORT, HOST, () => {
  console.log(`[intensa-api] escuchando en http://${HOST}:${PORT}`);
  console.log(`[intensa-api] CONTROL_DB=${process.env.CONTROL_DB || '/root/secretaria/state/control/control.sqlite'}`);
  console.log(`[intensa-api] instancias activas: ${instances.listActive().map(i => i.slug).join(', ') || '(none)'}`);
});

// Graceful shutdown
['SIGINT','SIGTERM'].forEach(sig => process.on(sig, () => {
  console.log(`[intensa-api] ${sig} recibido, cerrando…`);
  db.close();
  process.exit(0);
}));
