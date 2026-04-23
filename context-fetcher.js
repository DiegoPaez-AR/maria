// context-fetcher.js — recupera historial de WA y Gmail con un remitente.
//
// Usado por unknown-flow.js cuando le escribe alguien desconocido y Maria
// necesita chequear si tiene contexto previo (conversaciones, emails) con
// esa persona. Nos apoyamos en WA Web (fetchMessages del chat) y en la API
// de Gmail (search), así no cargamos nuestra DB local para esto.
//
// Todo devuelve un array de líneas formateadas `[dir] YYYY-MM-DD HH:MM · texto`
// listo para pegar en un prompt. No levantamos errores al caller —
// devolvemos arrays vacíos si algo falla (degradación silenciosa).

const MS_DIA = 24 * 3600 * 1000;

/**
 * Historial de WhatsApp con `from`. Lee el chat de WA Web y filtra por fecha.
 *
 *  - waClient: cliente whatsapp-web.js
 *  - from:     jid del remitente (xxx@lid o xxx@c.us)
 *  - opts.dias: ventana en días (default 14)
 *  - opts.max:  tope de mensajes a traer del chat (default 200)
 *
 * Devuelve { ok: boolean, lineas: string[], total: number, error?: string }.
 */
async function historialWA(waClient, from, { dias = 14, max = 200 } = {}) {
  if (!waClient || !from) return { ok: false, lineas: [], total: 0, error: 'waClient/from faltantes' };
  const desde = Date.now() - dias * MS_DIA;
  try {
    const chat = await waClient.getChatById(from);
    if (!chat) return { ok: true, lineas: [], total: 0 };
    const mensajes = await chat.fetchMessages({ limit: max });
    const filtrados = (mensajes || [])
      .filter(m => {
        const tsMs = (m.timestamp ? m.timestamp * 1000 : 0);
        return tsMs >= desde;
      })
      .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    const lineas = filtrados.map(_formatearWA).filter(Boolean);
    return { ok: true, lineas, total: filtrados.length };
  } catch (err) {
    return { ok: false, lineas: [], total: 0, error: err.message };
  }
}

function _formatearWA(m) {
  try {
    const ts = m.timestamp ? new Date(m.timestamp * 1000) : null;
    const fecha = ts ? `${ts.toISOString().slice(0, 16).replace('T', ' ')}` : '????-??-?? ??:??';
    const dir = m.fromMe ? '← Maria' : '→ remitente';
    let texto = '';
    if (m.body) texto = String(m.body).replace(/\s+/g, ' ').trim();
    else if (m.type === 'ptt' || m.type === 'audio') texto = '(audio)';
    else if (m.type === 'image') texto = '(imagen)';
    else if (m.type === 'vcard') texto = '(vcard)';
    else if (m.type === 'location') texto = '(ubicación)';
    else texto = `(${m.type || 'msg'})`;
    return `[${dir}] ${fecha} · ${texto.slice(0, 300)}`;
  } catch {
    return null;
  }
}

/**
 * Historial de Gmail con `email`. Delega en google.buscarMensajesCon.
 *
 *  - g:     módulo ./google
 *  - email: email del remitente (puede venir como "Nombre <x@y>" o "x@y")
 *  - opts.dias: ventana (default 14)
 *  - opts.max:  tope de mensajes (default 50)
 *
 * Devuelve { ok, lineas, total, error? }.
 */
async function historialEmail(g, email, { dias = 14, max = 50 } = {}) {
  if (!g || !email) return { ok: false, lineas: [], total: 0, error: 'g/email faltantes' };
  const m = String(email).match(/<([^>]+)>/);
  const plano = (m ? m[1] : String(email)).trim().toLowerCase();
  if (!plano || !plano.includes('@')) return { ok: true, lineas: [], total: 0 };
  try {
    const mensajes = await g.buscarMensajesCon(plano, { dias, max });
    const lineas = (mensajes || []).map(_formatearEmail).filter(Boolean);
    return { ok: true, lineas, total: mensajes.length };
  } catch (err) {
    return { ok: false, lineas: [], total: 0, error: err.message };
  }
}

function _formatearEmail(e) {
  try {
    const fecha = (e.fecha || '').slice(0, 16).replace('T', ' ');
    const dir = e.saliente ? '← Maria' : '→ remitente';
    const asunto = (e.asunto || '(sin asunto)').replace(/\s+/g, ' ').slice(0, 120);
    const snippet = (e.snippet || '').replace(/\s+/g, ' ').slice(0, 200);
    return `[${dir}] ${fecha} · ${asunto} — ${snippet}`;
  } catch {
    return null;
  }
}

/**
 * Historial reciente owner ↔ Maria desde nuestros eventos. Útil para que el
 * LLM de unknown-flow vea si el owner nos pidió previamente que creemos a
 * alguien (prospecto pendiente).
 *
 *  - mem:    módulo ./memory (para listar eventos)
 *  - owner:  objeto usuario owner
 *  - dias:   ventana (default 14)
 */
function historialOwnerConMaria(mem, owner, { dias = 14, max = 80 } = {}) {
  if (!mem || !owner) return { ok: false, lineas: [], total: 0 };
  try {
    const desde = new Date(Date.now() - dias * MS_DIA).toISOString();
    const filas = mem.db.prepare(`
      SELECT timestamp, canal, direccion, cuerpo
      FROM eventos
      WHERE usuario_id = ? AND canal = 'whatsapp' AND timestamp >= ?
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(owner.id, desde, max);
    const lineas = filas.reverse().map(f => {
      const ts = String(f.timestamp).slice(0, 16).replace('T', ' ');
      const dir = f.direccion === 'entrante' ? `→ ${owner.nombre}` : (f.direccion === 'saliente' ? '← Maria' : '· sistema');
      const t = (f.cuerpo || '').replace(/\s+/g, ' ').slice(0, 260);
      return `[${dir}] ${ts} · ${t}`;
    });
    return { ok: true, lineas, total: filas.length };
  } catch (err) {
    return { ok: false, lineas: [], total: 0, error: err.message };
  }
}

module.exports = {
  historialWA,
  historialEmail,
  historialOwnerConMaria,
};
