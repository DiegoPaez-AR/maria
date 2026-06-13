// ratelimit.js — limitador en memoria simple (ventana deslizante por clave).
// intensa-api es un único proceso, así que un Map en memoria alcanza. No
// persiste entre reinicios (aceptable: un reinicio resetea los contadores).

const _hits = new Map(); // clave -> [timestamps]

function _evict(arr, desde) { while (arr.length && arr[0] < desde) arr.shift(); }

/**
 * Devuelve true si la clave está DENTRO del límite (puede seguir), false si
 * lo superó. `max` hits por `ventanaMs`.
 */
function permitir(clave, { max, ventanaMs }) {
  const ahora = Date.now();
  const desde = ahora - ventanaMs;
  let arr = _hits.get(clave);
  if (!arr) { arr = []; _hits.set(clave, arr); }
  _evict(arr, desde);
  if (arr.length >= max) return false;
  arr.push(ahora);
  return true;
}

// Limpieza periódica de claves viejas (evita fuga de memoria).
setInterval(() => {
  const corte = Date.now() - 6 * 3600_000; // 6h
  for (const [k, arr] of _hits) {
    _evict(arr, corte);
    if (!arr.length) _hits.delete(k);
  }
}, 30 * 60_000).unref?.();

function ipDe(req) {
  return (req.headers['x-forwarded-for']?.split(',')[0]?.trim()) || req.socket?.remoteAddress || 'unknown';
}

module.exports = { permitir, ipDe };
