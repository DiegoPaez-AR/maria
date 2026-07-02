// turn-state.js — estado efímero compartido dentro del proceso principal entre
// los handlers (whatsapp/gmail) y la internal-api, para el flujo MCP de
// acciones (fase 2). Dos responsabilidades:
//
// 1) GUARD DE TURNO OBSOLETO — keyed por CHAT (2026-07-02, antes por usuario):
//    la clave es el chat/hilo que disparó el turno ('whatsapp:<from>'). Un
//    mensaje nuevo EN ESE CHAT invalida las acciones del turno en curso —
//    misma semántica que el abort legacy del whatsapp-handler (_lastIncoming
//    por from). Keyear por usuario generaba falsos positivos (un WA del
//    usuario mataba acciones de un turno de email/tercero) y falsos negativos
//    (un tercero que reescribía no frenaba nada). Turnos gmail no registran
//    lastInbound → sin guard (paridad con legacy).
//
// 2) RESULTADOS DEL TURNO — /accion acumula {ok, accion, resultado|error} por
//    (chatKey, turnStartTs); el handler los toma al cierre del turno para
//    aplicar los backstops deterministas que en legacy corren post-ejecución
//    (_componerAvisoFallas + cancelar trigger_externo — caso Kona/Evelia) y
//    para deduplicar responder_email en gmail (tool + slot).
//
// Todo en memoria del proceso vivo: internal-api y handlers comparten la
// misma instancia (cache de require de Node). El MCP server (proceso aparte)
// pasa chatKey/turnStartTs en el body de /accion.

const TTL_MS = 10 * 60 * 1000; // GC: turnos muertos (abort/crash) se limpian solos

const _lastInboundByChat = new Map(); // chatKey -> ts (ms epoch)
const _turnResults       = new Map(); // `${chatKey}|${turnStartTs}` -> { ts, results: [] }

function setLastInbound(chatKey, ts = Date.now()) {
  if (!chatKey) return;
  _lastInboundByChat.set(String(chatKey), ts);
}

function getLastInbound(chatKey) {
  if (!chatKey) return null;
  return _lastInboundByChat.get(String(chatKey)) || null;
}

function _gc() {
  const ahora = Date.now();
  for (const [k, v] of _turnResults) {
    if (ahora - v.ts > TTL_MS) _turnResults.delete(k);
  }
  // lastInbound también, para que el map no crezca sin límite
  if (_lastInboundByChat.size > 5000) {
    for (const [k, ts] of _lastInboundByChat) {
      if (ahora - ts > 24 * 60 * 60 * 1000) _lastInboundByChat.delete(k);
    }
  }
}

function addTurnResult(chatKey, turnStartTs, result) {
  if (!chatKey || !turnStartTs || !result) return;
  _gc();
  const k = `${chatKey}|${turnStartTs}`;
  let e = _turnResults.get(k);
  if (!e) { e = { ts: Date.now(), results: [] }; _turnResults.set(k, e); }
  e.results.push(result);
}

// Devuelve y BORRA los resultados del turno (el handler los procesa una vez).
function takeTurnResults(chatKey, turnStartTs) {
  if (!chatKey || !turnStartTs) return [];
  const k = `${chatKey}|${turnStartTs}`;
  const e = _turnResults.get(k);
  if (!e) return [];
  _turnResults.delete(k);
  return e.results;
}

module.exports = { setLastInbound, getLastInbound, addTurnResult, takeTurnResults };

