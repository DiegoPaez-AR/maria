// internal-api.js — HTTP API local de Maria, escucha en 127.0.0.1:$ASISTENTE_INTERNAL_PORT.
// Lo consume el servicio `intensa-api` para:
//   POST /send-wa        { to, body }                 → WhatsApp por el bridge (usuarios: TG/email, política v5)
//   POST /send-email     { to, subject, html, text }  → manda email vía Gmail
//   POST /validate-wa     { wa }                          → normaliza formato del wid (sin lookup: no hay wwebjs)
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
      // ── Webhook AutoResponder (2026-08-02): ruta PÚBLICA via nginx, con su
      // propio secret en el path (el teléfono no conoce el internal secret).
      // Cola de salientes para Tasker (2026-08-04): el teléfono pregunta si
      // hay algo para iniciar y confirma cuando lo mandó.
      const _out = req.url.match(/^\/wa-hook\/([A-Za-z0-9_-]{16,})\/(pendiente|pendiente\.txt|confirmar|confirmar-ultimo|mbdiag|mblog|mbfallo|mbmedia|mbctl)(?:\/(\d+))?$/);
      if (_out) {
        const HOOK_SECRET = process.env.WA_HOOK_SECRET || '';
        if (!HOOK_SECRET || _out[1] !== HOOK_SECRET) return send(401, { error: 'unauthorized' });
        const outbox = require('./wa-outbox');
        try { require('./wa-hook').latir(); } catch {}
        if (_out[2] === 'pendiente') {
          const p = outbox.siguiente();
          return send(200, p || {});
        }
        // Variante texto plano para Tasker (2026-08-06): una línea
        // "id|numero|texto-urlencoded" (o vacío). Evita depender del parseo
        // de JSON de Tasker, que no resolvía %http_data.campo.
        if (_out[2] === 'pendiente.txt') {
          // Control remoto (2026-08-18) tiene PRIORIDAD: si hay un comando CTL
          // encolado, se sirve antes que cualquier mensaje.
          try {
            const ctl = require('./mb-control').siguiente();
            if (ctl) { res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end(ctl); }
          } catch (e) { console.warn('[mb-control] siguiente:', e.message); }
          const p = outbox.siguiente();
          res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
          if (!p) return res.end('');
          // 4º campo = NOMBRE del contacto tal como WhatsApp lo muestra en la
          // notificación (2026-08-15, para MariaBridge: responde por RemoteInput
          // matcheando el título de la notif = nombre agendado). El VPS lo
          // resuelve por número contra usuarios/libreta; MariaBridge cae al
          // número si no matchea (chats no agendados muestran el número).
          let nombre = '';
          try {
            const dig = String(p.numero).replace(/\D/g, '');
            // ⚠️ 9-MÓVIL AR (bug real 23/8, envío a Manuel Carrasco): el número
            // que servimos ya viene normalizado a 549…, pero la libreta puede
            // tenerlo guardado como 54… (sin el 9). Al no matchear, el nombre
            // salía VACÍO y la app abortaba con `chat_equivocado` — abría el
            // chat correcto y se negaba a enviar porque no tenía contra qué
            // comparar el título. Ahora las formas posibles las da telefonos.js.
            const cands = require('./telefonos').variantes(dig);
            const owner = usuarios.obtenerOwner();
            for (const cand of cands) {
              const u = usuarios.resolverPorWa(cand + '@c.us');
              if (u) { nombre = u.nombre; break; }
              const c = owner ? mem.buscarContacto({ usuarioId: owner.id, whatsapp: cand + '@c.us' }) : null;
              if (c) { nombre = c.nombre; break; }
            }
            if (!nombre) console.warn(`[pendiente.txt] #${p.id}: sin nombre para ${dig} — la app sólo podrá verificar el chat por número`);
          } catch {}
          // 5º campo: modo del envío (2026-08-21, número NUEVO de Maria).
          // WA_WARMUP=1 → "R" = reply-only: la app responde si hay notif viva
          // del chat, pero NO abre chats nuevos (cero cold-send mientras el
          // número madura). Sin warmup → "F" (full, cold-send permitido).
          const modo = process.env.WA_WARMUP === '1' ? 'R' : 'F';
          return res.end(`${p.id}|${p.numero}|${encodeURIComponent(p.texto)}|${encodeURIComponent(nombre)}|${modo}`);
        }
        if (_out[2] === 'confirmar-ultimo') {
          return send(200, outbox.confirmarUltimo());
        }
        if (_out[2] === 'mblog') {
          // Logs unificados de MariaBridge (2026-08-16): la app postea en lote;
          // quedan en el log de pm2 con prefijo [MB] — grep único para debug.
          const b = await readJson(req).catch(() => ({}));
          const lineas = Array.isArray(b.lineas) ? b.lineas : [];
          for (const l of lineas.slice(0, 100)) console.log(`[MB v${b.ver || '?'}] ${String(l).slice(0, 400)}`);
          return send(200, { ok: true, recibidas: lineas.length });
        }
        if (_out[2] === 'mbctl') {
          const b = await readJsonGrande(req).catch(() => null);
          if (!b || !b.id) return send(400, { error: 'payload' });
          return send(200, require('./mb-control').resolver(b));
        }
        if (_out[2] === 'mbmedia') {
          // Audio REAL desde MariaBridge (2026-08-17, 7a): la app caza el .opus
          // de la carpeta de medios de WA y lo sube; acá se transcribe con el
          // Whisper local y corre el turno normal con la transcripción.
          const b = await readJsonGrande(req, 16 * 1024 * 1024).catch(() => null);
          if (!b || !b.data || !b.sender) return send(400, { error: 'payload' });
          const buf = Buffer.from(String(b.data), 'base64');
          const ext = (String(b.fileName || '').match(/\.(\w+)$/) || [])[1] || 'opus';
          const tipo = String(b.tipo || 'audio');

          if (tipo === 'video') {
            // v3.2: video entrante → transcribimos el AUDIO (paridad TG: ffmpeg
            // extrae de mp4). La imagen del video no se procesa (igual que TG).
            let tv = null;
            try {
              const { transcribirBuffer } = require('./transcribir');
              tv = await transcribirBuffer(buf, ext === 'bin' ? 'mp4' : ext);
            } catch (e) { console.warn('[mbmedia] video transcripción falló:', e.message); }
            let mediaIdV = null;
            try { mediaIdV = require('./media-store').guardar(buf, b.fileName || 'video.mp4'); } catch { /* noop */ }
            if (!tv || !String(tv).trim()) return send(200, { replies: [], transcript: null });
            console.log(`[MB-MEDIA] video de "${b.sender}" (${Math.round(buf.length / 1024)}KB) → "${String(tv).slice(0, 60)}"`);
            let msjV = `(video recibido — transcripción del audio) ${String(tv).trim()}`;
            if (mediaIdV) msjV += `\n(sistema: adjunto guardado con id "${mediaIdV}" — enviar_archivo_wa para reenviar)`;
            const rv = await require('./wa-hook').procesar({ query: { sender: b.sender, message: msjV } });
            return send(200, { ...(rv || {}), transcript: String(tv).slice(0, 200) });
          }

          if (tipo === 'imagen' || tipo === 'documento') {
            // v2.8: imagen/PDF real → archivo temporal → turno con VISIÓN
            // (mismo pipeline attachmentPath de Gmail/Telegram). Además se
            // PERSISTE en media-store (30d) para poder reenviarlo después.
            const fs2 = require('fs');
            const tmp = `/tmp/maria-attach-mb-${Date.now()}.${ext}`;   // prefijo maria-attach-* = el sandbox lo bind-mountea (si no, el LLM no puede leerlo)
            fs2.writeFileSync(tmp, buf);
            let mediaId = null;
            try { mediaId = require('./media-store').guardar(buf, b.fileName || `x.${ext}`); } catch (e) { console.warn('[mbmedia] guardar falló:', e.message); }
            console.log(`[MB-MEDIA] ${tipo} de "${b.sender}" (${Math.round(buf.length / 1024)}KB) → ${tmp}${mediaId ? ` (guardado: ${mediaId})` : ''}`);
            try {
              const caption = String(b.caption || '').trim();
              let msj = caption && !/^(📷|📄|photo|foto|imagen|documento)/i.test(caption)
                ? caption : (tipo === 'imagen' ? '(te mandé una imagen — mirala)' : '(te mandé un documento — miralo)');
              if (mediaId) msj += `\n(sistema: adjunto guardado con id "${mediaId}" — si piden reenviarlo/compartirlo usá enviar_archivo_wa con ese id)`;
              const r = await require('./wa-hook').procesar({ query: { sender: b.sender, message: msj, attachmentPath: tmp } });
              return send(200, { ...(r || {}), adjunto: true, mediaId });
            } finally {
              try { fs2.unlinkSync(tmp); } catch { /* noop */ }
            }
          }

          let transcript = null;
          try {
            const { transcribirBuffer } = require('./transcribir');
            transcript = await transcribirBuffer(buf, ext);
          } catch (e) { console.warn('[mbmedia] transcripción falló:', e.message); }
          if (!transcript || !String(transcript).trim()) {
            console.warn(`[MB-MEDIA] audio de "${b.sender}" (${Math.round(buf.length / 1024)}KB) — transcripción vacía, la app cae al hint`);
            return send(200, { replies: [], transcript: null });
          }
          console.log(`[MB-MEDIA] audio de "${b.sender}" (${Math.round(buf.length / 1024)}KB) → "${String(transcript).slice(0, 80)}"`);
          const r = await require('./wa-hook').procesar({ query: { sender: b.sender, message: `(audio de voz, transcripto) ${String(transcript).trim()}` } });
          return send(200, { ...(r || {}), transcript: String(transcript).slice(0, 200) });
        }
        if (_out[2] === 'mbfallo') {
          const b = await readJson(req).catch(() => ({}));
          const r = require('./wa-outbox').registrarFalloCold(Number(b.id), String(b.motivo || ''));
          console.log(`[MB-FALLO] #${b.id} motivo=${b.motivo} → ${JSON.stringify(r)}`);
          return send(200, r);
        }
        if (_out[2] === 'mbdiag') {
          const b = await readJson(req).catch(() => ({}));
          console.log(`[MB-DIAG] buscaba nombre="${b.buscaba_nombre}" numero="${b.buscaba_numero}" pendiente=${b.pendiente} | chats_vivos=[${b.chats_vivos}]`);
          try { mem.log({ canal: 'sistema', direccion: 'interno', cuerpo: `mbdiag: buscaba "${b.buscaba_nombre}"/"${b.buscaba_numero}" vivos=[${String(b.chats_vivos).slice(0,300)}]`, metadata: { tipo: 'mbdiag', ...b } }); } catch {}
          return send(200, { ok: true });
        }
        // confirmar: acepta GET .../confirmar/<id> (Tasker-friendly, sin body)
        // o POST con {id} en el body.
        let id = _out[3] || (req.url.match(/id=(\d+)/) || [])[1];
        if (!id && req.method === 'POST') {
          const b = await readJson(req).catch(() => ({}));
          id = b && b.id ? b.id : null;
        }
        return send(200, { ok: outbox.confirmar(id) });
      }

      const _hook = req.url.match(/^\/wa-hook\/([A-Za-z0-9_-]{16,})$/);
      if (_hook) {
        const HOOK_SECRET = process.env.WA_HOOK_SECRET || '';
        if (!HOOK_SECRET || _hook[1] !== HOOK_SECRET) return send(401, { error: 'unauthorized' });
        if (req.method !== 'POST') return send(405, { error: 'method_not_allowed' });
        const cuerpo = await readJson(req);
        const r = await require('./wa-hook').procesar(cuerpo);
        return send(200, r);
      }

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
        // ERA BRIDGE (2026-08-22): ya no hay waClient. El canal WA real es la
        // cola wa_outbox que drena el teléfono. Además, si el destino es un
        // USUARIO, la política v5 manda: no se le escribe por WhatsApp, sale
        // por Telegram/email. Esto revive los avisos de ops (healthcheck,
        // backup, canary) que devolvían 503 desde que se apagó wwebjs.
        try {
          const waSend = require('./wa-send');
          let destinatario = null;
          try { destinatario = usuarios.resolverPorWa(to); } catch { /* noop */ }
          if (destinatario && destinatario.activo) {
            const r = await waSend.enviarWAUsuario(null, destinatario, text, {
              tag: 'internal-api/send-wa',
              metadata: { tipo: 'internal-api/send-wa', origen: 'ops' },
            });
            return send(200, { ok: true, via: r?.canal || 'usuario', sent_to: destinatario.nombre });
          }
          const r = await waSend.enviarWADirecto(null, to, text, {
            usuarioId, tag: 'internal-api/send-wa',
            metadata: { tipo: 'internal-api/send-wa', nombre },
          });
          return send(200, { ok: true, via: 'outbox', outboxId: r?.outboxId || null, sent_to: to });
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
        // Sin wwebjs no hay lookup contra Meta: normalizamos formato y
        // avisamos que NO está verificado (lo verifica el teléfono al enviar).
        const { normalizarWaCus } = require('./wa-validate');
        try {
          const resolved = await normalizarWaCus(wa, null);
          return send(200, { ok: true, input: wa, resolved, verificado: false });
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
        // Normalización de formato del wa_cus (sin lookup: era bridge).
        if (patch.wa_cus) {
          try {
            const waValidate = require('./wa-validate');
            patch.wa_cus = await waValidate.normalizarWaCus(patch.wa_cus, null);
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
        // refrescarCache no existe — endpoint no-op (auditoría). Se mantiene por compat de callers viejos.
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

function readJsonGrande(req, cap = 8 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let buf = '';
    req.on('data', c => { buf += c; if (buf.length > cap) { req.destroy(); reject(new Error('body too big')); } });
    req.on('end', () => { try { resolve(buf ? JSON.parse(buf) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
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
