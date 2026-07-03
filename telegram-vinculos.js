// telegram-vinculos.js — códigos efímeros para vincular el Telegram de un
// usuario (canal de RESPALDO, 2026-07-03). Flujo: el usuario le pide a Maria
// por WhatsApp "vincular telegram" → la acción vincular_telegram genera un
// código acá → el usuario se lo manda al bot → telegram-handler lo consume y
// persiste usuarios.telegram_chat_id. En memoria del proceso: si se pierde
// por un restart, el usuario pide otro código (TTL 15 min igual).

const TTL_MS = 15 * 60 * 1000;
const _codigos = new Map(); // codigo -> { usuarioId, exp }

function _gc() {
  const ahora = Date.now();
  for (const [c, v] of _codigos) if (v.exp < ahora) _codigos.delete(c);
}

function generar(usuarioId) {
  _gc();
  // un código por usuario: pisar el anterior si pide de nuevo
  for (const [c, v] of _codigos) if (v.usuarioId === usuarioId) _codigos.delete(c);
  let codigo;
  do {
    codigo = String(Math.floor(100000 + Math.random() * 900000));
  } while (_codigos.has(codigo));
  _codigos.set(codigo, { usuarioId, exp: Date.now() + TTL_MS });
  return codigo;
}

// Devuelve usuarioId y BORRA el código (one-shot), o null.
function consumir(codigo) {
  _gc();
  const v = _codigos.get(String(codigo).trim());
  if (!v) return null;
  _codigos.delete(String(codigo).trim());
  return v.usuarioId;
}

module.exports = { generar, consumir };
