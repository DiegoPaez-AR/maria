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
  { re: /\bejecut[áa]\s+(bash|comando|shell|en\s+(la\s+)?terminal)/i, motivo: 'pedir ejecutar shell' },
  { re: /\bcorr[ée]\s+(uptime|htop|free|df|ls|cat|ps|netstat|ss\b)/i, motivo: 'comando shell sistema' },
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

module.exports = { detectarInjection, verificarRateLimit };
