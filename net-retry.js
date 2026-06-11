// net-retry.js — reintentos con backoff exponencial + jitter para llamadas de red.
//
// Uso:
//   const { conReintentos } = require('./net-retry');
//   const r = await conReintentos(() => api.algo(), { tag: 'gmail.messages.list' });
//
// Reintenta SOLO errores transitorios: HTTP 429, 500, 502, 503, 504. El status
// se detecta en err.status, err.code o err.response.status (según la lib que
// tire el error: fetch, gaxios, etc.). Cualquier otro 4xx se relanza inmediato.
// Si el error trae header Retry-After, se respeta (cap 30s).

const RETRYABLES = new Set([429, 500, 502, 503, 504]);

// Extrae el status HTTP del error, probando los lugares donde lo dejan las
// distintas libs. err.code en gaxios puede ser número o string ('ECONNRESET');
// los strings no-numéricos quedan afuera.
function _statusDe(err) {
  if (!err) return null;
  for (const v of [err.status, err.code, err.response && err.response.status]) {
    const n = Number(v);
    if (Number.isInteger(n) && n >= 100 && n < 600) return n;
  }
  return null;
}

// Si el server mandó Retry-After (en segundos o fecha HTTP), devuelve los ms
// a esperar (cap 30s). Soporta headers tipo objeto plano y tipo Headers (.get).
function _retryAfterMs(err) {
  const headers = (err && err.response && err.response.headers) || (err && err.headers) || null;
  if (!headers) return null;
  const v = typeof headers.get === 'function'
    ? headers.get('retry-after')
    : (headers['retry-after'] || headers['Retry-After']);
  if (!v) return null;
  const seg = Number(v);
  let ms;
  if (Number.isFinite(seg)) {
    ms = seg * 1000;
  } else {
    const fecha = Date.parse(v);
    if (Number.isNaN(fecha)) return null;
    ms = fecha - Date.now();
  }
  if (ms <= 0) return null;
  return Math.min(ms, 30_000);
}

const _sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Ejecuta fn() reintentando ante errores transitorios con backoff
 * exponencial (baseMs * 2^n) + jitter (±20%). `intentos` es el total de
 * ejecuciones (3 = 1 intento + 2 reintentos). `tag` identifica el call-site
 * en los logs.
 */
async function conReintentos(fn, { intentos = 3, baseMs = 500, tag = '' } = {}) {
  let ultimoErr;
  for (let n = 0; n < intentos; n++) {
    try {
      return await fn();
    } catch (err) {
      ultimoErr = err;
      const status = _statusDe(err);
      if (status == null || !RETRYABLES.has(status) || n === intentos - 1) throw err;
      // Retry-After del server gana; si no vino, backoff exponencial + jitter.
      let espera = _retryAfterMs(err);
      if (espera == null) {
        const base = baseMs * 2 ** n;
        espera = Math.round(base * (0.8 + Math.random() * 0.4));
      }
      console.warn(`[net-retry${tag ? ' ' + tag : ''}] HTTP ${status} — reintento ${n + 1}/${intentos - 1} en ${espera}ms`);
      await _sleep(espera);
    }
  }
  // No debería llegar acá, pero por las dudas.
  throw ultimoErr;
}

module.exports = { conReintentos };
