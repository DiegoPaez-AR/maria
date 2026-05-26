// internal-api.js — HTTP API local de Maria, escucha en 127.0.0.1:$ASISTENTE_INTERNAL_PORT.
// Lo consume el servicio `intensa-api` para:
//   POST /send-wa        { to, body }                 → manda WhatsApp
//   POST /send-email     { to, subject, html, text }  → manda email vía Gmail
//   POST /validate-wa     { wa }                          → corre normalizarWaCus contra el client vivo de WA
//   POST /reload-usuarios                              → re-lee la tabla usuarios (cache invalidate)
//   GET  /health                                       → healthcheck
//
// Autenticación: header X-Intensa-Secret debe matchear ASISTENTE_INTERNAL_SECRET del .conf.

const http = require('http');
const mem = require('./memory');
const usuarios = require('./usuarios');
const waSend = require('./wa-send');
const google = require('./google');

const PORT = Number(process.env.ASISTENTE_INTERNAL_PORT || 0);
const SECRET = process.env.ASISTENTE_INTERNAL_SECRET || '';

function start({ waClient } = {}) {
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
          // Verificar primero si el número está registrado en WhatsApp.
          // Esto evita el error opaco 'Evaluation failed' cuando el número no
          // tiene cuenta de WA o tiene problemas de getNumberId.
          let resolvedDest = dest;
          try {
            const numberId = await waClient.getNumberId(dest);
            if (numberId && numberId._serialized) resolvedDest = numberId._serialized;
            else console.warn(`[internal-api/send-wa] getNumberId returned null para ${dest} — intento envío igual`);
          } catch (resErr) {
            console.warn(`[internal-api/send-wa] getNumberId error para ${dest}:`, resErr.message);
          }
          await waClient.sendMessage(resolvedDest, text);
          mem.log({
            usuarioId: null,
            canal: 'whatsapp', direccion: 'saliente',
            para: resolvedDest, cuerpo: text,
            metadata: { tipo: 'internal-api/send-wa' },
          });
          return send(200, { ok: true, sent_to: resolvedDest });
        } catch (err) {
          console.error('[internal-api/send-wa] error:', err.stack || err.message);
          return send(502, { error: 'wa_send_failed', detail: err.message });
        }
      }

      if (req.url === '/lid-info') {
        // Temporal — diagnóstico para diseñar la conversión LID → c.us en wa-validate.
        const { lid } = body;
        if (!lid) return send(400, { error: 'bad_body', need: 'lid' });
        if (!waClient) return send(503, { error: 'wa_not_ready' });
        try {
          const contact = await waClient.getContactById(lid);
          // Extraemos propiedades que podrían contener el número original.
          const dump = {
            id: contact?.id,
            number: contact?.number,
            pushname: contact?.pushname,
            name: contact?.name,
            shortName: contact?.shortName,
            type: contact?.type,
            isBusiness: contact?.isBusiness,
            isWAContact: contact?.isWAContact,
            isMyContact: contact?.isMyContact,
            isUser: contact?.isUser,
          };
          // Intento extra: ¿getNumberId del propio LID devuelve un @c.us?
          let getNumberIdResult = null;
          try {
            const numStr = (contact?.number || lid.replace(/@.*/, ''));
            const r = await waClient.getNumberId(numStr);
            getNumberIdResult = r ? { _serialized: r._serialized, user: r.user, server: r.server } : null;
          } catch (e) {
            getNumberIdResult = { error: e.message };
          }
          return send(200, { ok: true, lid, contact: dump, getNumberIdReverse: getNumberIdResult });
        } catch (err) {
          return send(200, { ok: false, lid, error: err.message });
        }
      }

      if (req.url === '/validate-wa') {
        const { wa } = body;
        if (!wa) return send(400, { error: 'bad_body', need: 'wa' });
        if (!waClient) return send(503, { error: 'wa_not_ready' });
        const { normalizarWaCus } = require('./wa-validate');
        try {
          const resolved = await normalizarWaCus(wa, waClient);
          return send(200, { ok: true, input: wa, resolved });
        } catch (err) {
          return send(200, { ok: false, input: wa, error: err.message });
        }
      }

      if (req.url === '/send-email') {
        const { to, subject, html, text } = body;
        if (!to || !subject || (!html && !text)) return send(400, { error: 'bad_body' });
        // google.js maneja la autenticación internamente vía autenticar(). No
        // necesitamos pasarle un auth desde acá.
        try {
          await google.enviarEmail({
            to,
            asunto: subject,
            texto: text || _htmlAText(html || ''),
            html: html || undefined,
          });
          return send(200, { ok: true });
        } catch (err) {
          console.error('[internal-api/send-email] error:', err.stack || err.message);
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

function _htmlAText(html) {
  return String(html)
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

module.exports = { start };
