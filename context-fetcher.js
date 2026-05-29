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

// ── Helper: convierte un timestamp (Date | epoch ms | ISO | "YYYY-MM-DD HH:MM:SS"
// almacenado en UTC por SQLite) a "YYYY-MM-DD HH:MM" en la zona del usuario.
// Sin esto, el historial que ve el LLM viene en UTC y termina razonando/
// respondiendo horas en UTC (incidente Poch, 2026-05-28). Default AR.
function _tsLocal(tsLike, tz) {
  try {
    if (tsLike === null || tsLike === undefined || tsLike === '') return '????-??-?? ??:??';
    let d;
    if (tsLike instanceof Date) d = tsLike;
    else if (typeof tsLike === 'number') d = new Date(tsLike);
    else {
      let s = String(tsLike).trim();
      // SQLite "YYYY-MM-DD HH:MM:SS" sin zona → es UTC
      if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(s)) s = s.replace(' ', 'T') + 'Z';
      // ISO sin zona explícita → asumir UTC
      else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s) && !/[Zz]|[+-]\d{2}:?\d{2}$/.test(s)) s = s + 'Z';
      d = new Date(s);
    }
    if (isNaN(d.getTime())) return String(tsLike).slice(0, 16).replace('T', ' ');
    const z = tz || 'America/Argentina/Buenos_Aires';
    // sv-SE produce "YYYY-MM-DD HH:MM" en 24h
    return new Intl.DateTimeFormat('sv-SE', {
      timeZone: z, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(d).replace(',', '');
  } catch {
    return String(tsLike).slice(0, 16).replace('T', ' ');
  }
}


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
async function historialWA(waClient, from, { dias = 14, max = 200, chat = null, tz = null } = {}) {
  if (!waClient || (!from && !chat)) return { ok: false, lineas: [], total: 0, error: 'waClient/from faltantes' };
  const desde = Date.now() - dias * MS_DIA;
  try {
    const chatObj = chat || (from ? await waClient.getChatById(from) : null);
    if (!chatObj) return { ok: true, lineas: [], total: 0 };
    const mensajes = await chatObj.fetchMessages({ limit: max });
    const filtrados = (mensajes || [])
      .filter(m => {
        const tsMs = (m.timestamp ? m.timestamp * 1000 : 0);
        return tsMs >= desde;
      })
      .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    const lineas = filtrados.map(m => _formatearWA(m, tz)).filter(Boolean);
    return { ok: true, lineas, total: filtrados.length };
  } catch (err) {
    return { ok: false, lineas: [], total: 0, error: err.message.split('\n')[0] };
  }
}

function _formatearWA(m, tz) {
  try {
    const fecha = _tsLocal(m.timestamp ? m.timestamp * 1000 : null, tz);
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
async function historialEmail(g, email, { dias = 14, max = 50, tz = null } = {}) {
  if (!g || !email) return { ok: false, lineas: [], total: 0, error: 'g/email faltantes' };
  const m = String(email).match(/<([^>]+)>/);
  const plano = (m ? m[1] : String(email)).trim().toLowerCase();
  if (!plano || !plano.includes('@')) return { ok: true, lineas: [], total: 0 };
  try {
    const mensajes = await g.buscarMensajesCon(plano, { dias, max });
    const lineas = (mensajes || []).map(e => _formatearEmail(e, tz)).filter(Boolean);
    return { ok: true, lineas, total: mensajes.length };
  } catch (err) {
    return { ok: false, lineas: [], total: 0, error: err.message.split('\n')[0] };
  }
}

function _formatearEmail(e, tz) {
  try {
    const fecha = _tsLocal(e.fecha, tz);
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
  return historialUsuarioConMaria(mem, owner, { dias, max });
}

/**
 * Historial reciente usuario ↔ Maria (WA) desde nuestros eventos. Generaliza
 * historialOwnerConMaria para cualquier usuario activo, no solo el owner.
 * Útil para el LLM pre-pass que ahora mira gestiones de todos los usuarios.
 */
function historialUsuarioConMaria(mem, usuario, { dias = 14, max = 80 } = {}) {
  if (!mem || !usuario) return { ok: false, lineas: [], total: 0 };
  try {
    const desde = new Date(Date.now() - dias * MS_DIA).toISOString();
    const filas = mem.db.prepare(`
      SELECT timestamp, canal, direccion, cuerpo
      FROM eventos
      WHERE usuario_id = ? AND canal = 'whatsapp' AND timestamp >= ?
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(usuario.id, desde, max);
    const lineas = filas.reverse().map(f => {
      const ts = _tsLocal(f.timestamp, usuario.tz);
      const dir = f.direccion === 'entrante' ? `→ ${usuario.nombre}` : (f.direccion === 'saliente' ? '← Maria' : '· sistema');
      const t = (f.cuerpo || '').replace(/\s+/g, ' ').slice(0, 260);
      return `[${dir}] ${ts} · ${t}`;
    });
    return { ok: true, lineas, total: filas.length };
  } catch (err) {
    return { ok: false, lineas: [], total: 0, error: err.message.split('\n')[0] };
  }
}

/**
 * Historiales WA de CADA usuario activo ↔ Maria. Devuelve un array
 * { usuario: {id, nombre, rol}, ok, lineas, total } por cada usuario activo
 * pasado. Usado por unknown-flow para clasificar terceros cuyo "dueño" no es
 * el owner (ej. Hernán le pidió a Maria que gestione algo y ahora responde
 * un tercero — la evidencia está en el bucket de Hernán, no del owner).
 */
function historialesDeTodosLosUsuarios(mem, usuariosActivos, { dias = 14, maxPorUsuario = 60 } = {}) {
  if (!Array.isArray(usuariosActivos)) return [];
  return usuariosActivos.map(u => {
    const res = historialUsuarioConMaria(mem, u, { dias, max: maxPorUsuario });
    return { usuario: { id: u.id, nombre: u.nombre, rol: u.rol }, ...res };
  });
}

module.exports = {
  historialWA,
  historialEmail,
  historialOwnerConMaria,
  historialUsuarioConMaria,
  historialesDeTodosLosUsuarios,
};
