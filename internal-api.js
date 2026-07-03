// internal-api.js — HTTP API local de Maria, escucha en 127.0.0.1:$ASISTENTE_INTERNAL_PORT.
// Lo consume el servicio `intensa-api` para:
//   POST /send-wa        { to, body }                 → manda WhatsApp
//   POST /send-email     { to, subject, html, text }  → manda email vía Gmail
//   POST /validate-wa     { wa }                          → corre normalizarWaCus contra el client vivo de WA
//   POST /update-usuario  { id, ...campos }                  → mutación de usuarios desde el proceso vivo (evita WAL stale reads)
//   POST /reload-usuarios                              → re-lee la tabla usuarios (cache invalidate)
//   GET  /health                                       → healthcheck
//
// Autenticación: header X-Intensa-Secret debe matchear ASISTENTE_INTERNAL_SECRET del .conf.

const http = require('http');
const crypto = require('crypto');
const mem = require('./memory');
const usuarios = require('./usuarios');
const waSend = require('./wa-send');
const google = require('./google');
const turnState = require('./turn-state');
const { ejecutarAcciones } = require('./executor');

const PORT = Number(process.env.ASISTENTE_INTERNAL_PORT || 0);
const SECRET = process.env.ASISTENTE_INTERNAL_SECRET || '';

function start({ waClient } = {}) {
  if (!PORT) {
    console.log('[internal-api] ASISTENTE_INTERNAL_PORT no seteado, internal-api desactivado');
    return null;
  }
  if (!SECRET) {
    // Antes: warn y servía sin auth → /send-wa y /send-email quedaban
    // abiertos a cualquier proceso local. Fix 2026-06-09: sin secret NO
    // arranca (puerto seteado = intención de usarlo en prod).
    console.error('[internal-api] ASISTENTE_INTERNAL_PORT seteado pero ASISTENTE_INTERNAL_SECRET vacío — internal-api NO arranca. Configurá el secret en el .conf.');
    return null;
  }

  const server = http.createServer(async (req, res) => {
    const send = (status, obj) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(obj));
    };

    try {
      if (!_secretOk(req.headers['x-intensa-secret'])) {
        return send(401, { error: 'unauthorized' });
      }

      if (req.method === 'GET' && req.url === '/health') {
        return send(200, { ok: true, instance: process.env.ASISTENTE_SLUG, ts: new Date().toISOString() });
      }

      if (req.method !== 'POST') return send(405, { error: 'method_not_allowed' });

      const body = await readJson(req);

      if (req.url === '/send-wa') {
        const { to, body: text, usuarioId = null, nombre = null } = body;
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
            usuarioId,
            canal: 'whatsapp', direccion: 'saliente',
            de: resolvedDest, nombre, cuerpo: text,
            metadata: { tipo: 'internal-api/send-wa' },
          });
          return send(200, { ok: true, sent_to: resolvedDest });
        } catch (err) {
          console.error('[internal-api/send-wa] error:', err.stack || err.message);
          return send(502, { error: 'wa_send_failed', detail: err.message });
        }
      }

      // /lid-info eliminado 2026-07-02 (review 0701): endpoint de diagnóstico
      // temporal que exponía metadata de contactos. El diseño LID→c.us ya cerró.

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

      if (req.url === '/update-usuario') {
        const { id, ...patch } = body;
        if (!id) return send(400, { error: 'bad_body', need: 'id + fields' });
        // Si viene wa_cus y tenemos waClient, validar antes de persistir.
        if (patch.wa_cus && waClient) {
          try {
            const waValidate = require('./wa-validate');
            patch.wa_cus = await waValidate.normalizarWaCus(patch.wa_cus, waClient);
          } catch (e) {
            return send(400, { error: 'wa_validate_failed', detail: e.message });
          }
        }
        try {
          const u = usuarios.actualizar(id, patch);
          return send(200, { ok: true, id: u.id, nombre: u.nombre, campos_actualizados: Object.keys(patch) });
        } catch (err) {
          console.error('[internal-api/update-usuario] error:', err.message);
          return send(400, { error: 'update_failed', detail: err.message });
        }
      }

      if (req.url === '/reload-usuarios') {
        usuarios.refrescarCache?.();
        return send(200, { ok: true, usuarios: usuarios.listarActivos().length });
      }

      if (req.url === '/accion') {
        // Ejecuta UNA acción del executor con el CONTEXTO VIVO (waClient +
        // usuario). Lo consume el MCP actions server (fase 2): el CLI llama al
        // tool, el tool pega acá, y el executor corre en el proceso principal
        // con todo el runtime (moderación, validación de destinatarios, etc.).
        const { usuarioId, accion, canalOrigen = 'whatsapp', turnStartTs = null, chatKey = null, turnoTercero = false } = body;
        if (!usuarioId || !accion || !accion.tipo) {
          return send(400, { error: 'bad_body', need: 'usuarioId + accion{tipo}' });
        }
        const usuario = usuarios.obtener(usuarioId);
        if (!usuario) return send(404, { error: 'usuario_not_found', usuarioId });
        // Guard de turno-viejo — keyed por CHAT que disparó el turno (2026-07-02,
        // antes por usuario: mataba acciones de turnos de email/tercero cuando el
        // usuario escribía cualquier cosa, y no frenaba turnos de terceros).
        // Misma semántica que el abort legacy del handler (_lastIncoming por from).
        // Sin chatKey (p.ej. turnos gmail) no hay guard — paridad con legacy.
        if (turnStartTs && chatKey) {
          const last = turnState.getLastInbound(chatKey);
          if (last && last > Number(turnStartTs)) {
            return send(200, { ok: false, stale: true,
              error: 'turno_obsoleto: llegó un mensaje nuevo en esta conversación mientras generabas; NO ejecuté esta acción. Regenerá tu respuesta contemplando el mensaje nuevo.' });
          }
        }
        try {
          const [r] = await ejecutarAcciones([accion], { usuario, waClient, canalOrigen, turnoDeTercero: !!turnoTercero });
          const res = r || { ok: false, accion, error: 'sin_resultado' };
          // Acumular para los backstops del cierre de turno (aviso honesto +
          // cancelar trigger_externo) — el handler los toma con takeTurnResults.
          turnState.addTurnResult(chatKey, turnStartTs, res);
          return send(200, res);
        } catch (err) {
          console.error('[internal-api/accion] error:', err.stack || err.message);
          const res = { ok: false, accion, error: err.message };
          turnState.addTurnResult(chatKey, turnStartTs, res);
          return send(200, res);
        }
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

// Comparación en tiempo constante (el !== cortocircuita por largo/prefijo).
function _secretOk(header) {
  if (typeof header !== 'string' || !header || !SECRET) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(SECRET);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
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
