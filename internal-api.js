// internal-api.js — HTTP API local de Maria, escucha en 127.0.0.1:$ASISTENTE_INTERNAL_PORT.
// Lo consume el servicio `intensa-api` para:
//   POST /send-wa        { to, body }                 → manda WhatsApp
//   POST /send-email     { to, subject, html, text }  → manda email vía Gmail
//   POST /reload-usuarios                              → re-lee la tabla usuarios (cache invalidate)
//   GET  /health                                       → healthcheck
//
// Autenticación: header X-Intensa-Secret debe matchear ASISTENTE_INTERNAL_SECRET del .conf.

const http = require('http');
const mem = require('./memory');
const usuarios = require('./usuarios');
const waSend = require('./wa-send');
const { enviarGmail } = require('./gmail-handler');

const PORT = Number(process.env.ASISTENTE_INTERNAL_PORT || 0);
const SECRET = process.env.ASISTENTE_INTERNAL_SECRET || '';

function start({ waClient, gmailAuth } = {}) {
  if (!PORT) {
    console.log('[internal-api] ASISTENTE_INTERNAL_PORT no seteado, internal-api desactivado');
    return null;
  }
  if (!SECRET) {
    console.warn('[internal-api] ASISTENTE_INTERNAL_SECRET vacío — sirviendo sin auth (NO USAR EN PROD)');
  }

  const server = http.createServer(async (req, res) => {
    const send = (status, obj) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(obj));
    };

    try {
      if (SECRET && req.headers['x-intensa-secret'] !== SECRET) {
        return send(401, { error: 'unauthorized' });
      }

      if (req.method === 'GET' && req.url === '/health') {
        return send(200, { ok: true, instance: process.env.ASISTENTE_SLUG, ts: new Date().toISOString() });
      }

      if (req.method !== 'POST') return send(405, { error: 'method_not_allowed' });

      const body = await readJson(req);

      if (req.url === '/send-wa') {
        const { to, body: text } = body;
        if (!to || !text) return send(400, { error: 'bad_body', need: 'to + body' });
        if (!waClient) return send(503, { error: 'wa_not_ready' });
        // Normalizar destino: si no tiene @c.us, agregarlo
        const dest = to.includes('@') ? to : `${to}@c.us`;
        try {
          await waClient.sendMessage(dest, text);
          mem.log({
            usuarioId: null,
            canal: 'whatsapp', direccion: 'saliente',
            para: dest, cuerpo: text,
            metadata: { tipo: 'internal-api/send-wa' },
          });
          return send(200, { ok: true, sent_to: dest });
        } catch (err) {
          console.error('[internal-api/send-wa] error:', err.message);
          return send(502, { error: 'wa_send_failed', detail: err.message });
        }
      }

      if (req.url === '/send-email') {
        const { to, subject, html, text } = body;
        if (!to || !subject || (!html && !text)) return send(400, { error: 'bad_body' });
        if (!gmailAuth) return send(503, { error: 'gmail_not_ready' });
        try {
          await enviarGmail(gmailAuth, { to, subject, html, text });
          return send(200, { ok: true });
        } catch (err) {
          console.error('[internal-api/send-email] error:', err.message);
          return send(502, { error: 'email_send_failed', detail: err.message });
        }
      }

      if (req.url === '/reload-usuarios') {
        usuarios.refrescarCache?.();
        return send(200, { ok: true, usuarios: usuarios.listarActivos().length });
      }

      return send(404, { error: 'not_found' });
    } catch (err) {
      console.error('[internal-api] handler error:', err.stack || err);
      send(500, { error: 'internal_error', detail: err.message });
    }
  });

  server.listen(PORT, '127.0.0.1', () => {
    console.log(`[internal-api] escuchando en 127.0.0.1:${PORT} (slug=${process.env.ASISTENTE_SLUG})`);
  });

  return server;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let buf = '';
    req.on('data', c => { buf += c; if (buf.length > 64*1024) { req.destroy(); reject(new Error('body too big')); } });
    req.on('end', () => {
      if (!buf) return resolve({});
      try { resolve(JSON.parse(buf)); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

module.exports = { start };
