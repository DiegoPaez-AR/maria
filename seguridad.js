// seguridad.js — defensas runtime de Maria
//
// 1) detectarInjection(texto): heurística por regex sobre texto entrante
//    (WA body, audio transcripto, asunto/body de email). Devuelve string
//    con motivo si matchea, null si no.
// 2) verificarRateLimit({usuarioId}): in-memory. Devuelve {ok, motivo} o
//    {ok: false, retry_in_ms}. Hace evict de timestamps viejos.

const PATRONES_INJECTION = [
  // Override de instrucciones
  { re: /ignor[áa]\s+(las|todas|tus)?\s*(las\s+)?(instrucci|reglas|prompt)/i, motivo: 'ignorar instrucciones' },
  { re: /(actualiz[áa]|cambi[áa]|modific[áa]|reemplaz[áa]|sobreescrib[íi])\s+tu\s+(prompt|c[oó]digo|sistema|instrucci|configuraci)/i, motivo: 'modificar tu sistema' },
  // Modos especiales
  { re: /modo\s+(admin|dev|debug|root|sudo|test|developer|sin\s+restriccion)/i, motivo: 'modo especial' },
  { re: /sos?\s+un\s+(asistente|modelo|ai|ia)\s+(sin|que\s+no\s+tiene)\s+restriccion/i, motivo: 'asistente sin restricciones' },
  // Acceso a archivos del sistema
  { re: /\bcat\s+\/(etc|root|var|opt|home|sys|proc)\b/i, motivo: 'cat path sistema' },
  { re: /le[ée]\s+(el\s+)?(archivo\s+)?\/(etc|root|var|opt|home|sys|proc)/i, motivo: 'leer path sistema' },
  { re: /\b(\/etc\/passwd|\/etc\/shadow|\/root\/\.ssh|id_rsa|id_ed25519|\.env|token\.json|credentials\.json)\b/i, motivo: 'mencionar archivo sensible' },
  // Exfiltración de secretos
  { re: /(mostrame|dame|env[íi]ame|mand[áa]me|pas[áa]me)\s+(el\s+)?(token|password|api\s*key|credenciales|credentials|secret|clave\s+secreta|env\s+var)/i, motivo: 'pedir credenciales' },
  // Ejecución de shell
  { re: /\b(ejecut[áa]|corr[ée]|tir[áa]|hac[ée])\s+(un\s+)?(bash|comando|shell|terminal|uptime|htop|free|df|ls|cat|ps|netstat|ss\b|whoami|id|env|env\s+vars?|printenv)/i, motivo: 'comando shell sistema' },
  // Pretender ser system
  { re: /<\s*(system|sistema|admin)\s*>/i, motivo: 'tag system' },
  { re: /^\s*(system|sistema|admin)\s*:/im, motivo: 'prefijo system:' },
  // Listar/inspeccionar el repo
  { re: /qu[ée]\s+(archivos|files)\s+(ten[ée]s|hay|tienes)|le[ée]\s+(la\s+)?carpeta\s+(de\s+)?donde|estructura\s+(de|del)\s+(repo|c[oó]digo|proyecto)/i, motivo: 'inspeccionar repo' },
];

function detectarInjection(texto) {
  if (!texto || typeof texto !== 'string') return null;
  for (const { re, motivo } of PATRONES_INJECTION) {
    if (re.test(texto)) return motivo;
  }
  return null;
}

// Rate limit in-memory. Map<usuarioId, number[]> con timestamps en ms.
const _porUsuario = new Map();
const _global = []; // timestamps globales
const VENTANA_MS = 60_000;
const MAX_USUARIO = Number(process.env.WA_RATE_LIMIT_PER_MIN || 15);
const MAX_GLOBAL  = Number(process.env.WA_RATE_LIMIT_GLOBAL_PER_MIN || 30);

function _evict(arr, now) {
  while (arr.length && now - arr[0] > VENTANA_MS) arr.shift();
}

function verificarRateLimit({ usuarioId }) {
  const now = Date.now();
  _evict(_global, now);
  if (_global.length >= MAX_GLOBAL) {
    return { ok: false, motivo: `cap global (${MAX_GLOBAL}/min)`, retry_in_ms: VENTANA_MS - (now - _global[0]) };
  }
  if (usuarioId != null) {
    let arr = _porUsuario.get(usuarioId);
    if (!arr) { arr = []; _porUsuario.set(usuarioId, arr); }
    _evict(arr, now);
    if (arr.length >= MAX_USUARIO) {
      return { ok: false, motivo: `cap por usuario (${MAX_USUARIO}/min)`, retry_in_ms: VENTANA_MS - (now - arr[0]) };
    }
    arr.push(now);
  }
  _global.push(now);
  return { ok: true };
}

// Solo deja dígitos para comparar números (whatsapp con/sin formato).
function _soloDigitos(x) { return String(x || '').replace(/\D+/g, ''); }

// Devuelve true si dos números matchean (last-N digits, mínimo 8 — cubre
// con/sin código país, con/sin 9 de Argentina).
function _wasapMatch(a, b) {
  const da = _soloDigitos(a);
  const db = _soloDigitos(b);
  if (!da || !db || da.length < 8 || db.length < 8) return false;
  return da === db || da.endsWith(db) || db.endsWith(da);
}

/**
 * Valida que `destino` sea un destinatario "conocido" para `usuario`:
 *  - canal 'wa': es wa_cus/wa_lid del propio usuario, o de otro usuario activo,
 *               o un contacto en libreta visible (privada del usuario o pública).
 *  - canal 'email': es el email del usuario, o de otro usuario activo,
 *                   o un contacto en libreta visible.
 * Devuelve { ok: true, motivo } si pasa, { ok: false, motivo } si rechaza.
 *
 * Bypass: env SEC_DESTINATARIO_STRICT=false desactiva la validación (siempre ok).
 */
function validarDestinatario({ usuario, canal, destino }) {
  if (process.env.SEC_DESTINATARIO_STRICT === 'false') {
    return { ok: true, motivo: 'strict-mode off (env)' };
  }
  if (!destino) return { ok: false, motivo: 'destino vacío' };
  if (!usuario) return { ok: false, motivo: 'usuario no provisto' };

  // lazy require para evitar ciclos (memory.js → seguridad? no, pero por las dudas)
  const mem = require('./memory');
  const usuarios = require('./usuarios');

  if (canal === 'wa' || canal === 'whatsapp') {
    // self
    if (_wasapMatch(destino, usuario.wa_cus) || destino === usuario.wa_lid) {
      return { ok: true, motivo: 'self' };
    }
    // otros usuarios activos
    const otros = usuarios.listarActivos();
    for (const u of otros) {
      if (u.id === usuario.id) continue;
      if (_wasapMatch(destino, u.wa_cus) || destino === u.wa_lid) {
        return { ok: true, motivo: `usuario activo (${u.nombre})` };
      }
    }
    // contactos en libreta visible (privada del usuario actual + pública)
    const todos = mem.todosLosContactos(usuario.id); // priv del user + públicos
    for (const c of todos) {
      if (!c.whatsapp) continue;
      if (_wasapMatch(destino, c.whatsapp) || destino === c.whatsapp) {
        return { ok: true, motivo: `libreta-${c.visibilidad} (${c.nombre})` };
      }
    }
    return { ok: false, motivo: `WA "${destino}" no está en libreta ni es usuario activo` };
  }

  if (canal === 'email' || canal === 'gmail') {
    const dest = String(destino).toLowerCase().trim();
    // self
    if ((usuario.email || '').toLowerCase() === dest) {
      return { ok: true, motivo: 'self' };
    }
    // otros usuarios activos
    const otros = usuarios.listarActivos();
    for (const u of otros) {
      if (u.id === usuario.id) continue;
      if ((u.email || '').toLowerCase() === dest) {
        return { ok: true, motivo: `usuario activo (${u.nombre})` };
      }
    }
    // contactos en libreta visible
    const todos = mem.todosLosContactos(usuario.id);
    for (const c of todos) {
      if (!c.email) continue;
      if (c.email.toLowerCase() === dest) {
        return { ok: true, motivo: `libreta-${c.visibilidad} (${c.nombre})` };
      }
    }
    return { ok: false, motivo: `email "${destino}" no está en libreta ni es usuario activo` };
  }

  return { ok: false, motivo: `canal desconocido "${canal}"` };
}

module.exports = { detectarInjection, verificarRateLimit, validarDestinatario };
