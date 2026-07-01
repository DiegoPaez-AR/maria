// turn-state.js — estado efímero compartido dentro del proceso principal entre
// whatsapp-handler y la internal-api, para el guard de "turno viejo" del flujo
// MCP de acciones (fase 2). whatsapp-handler registra el timestamp del último
// mensaje ENTRANTE por usuario; el endpoint /accion lo consulta para NO
// ejecutar acciones de un turno que ya quedó obsoleto (llegó un mensaje nuevo
// del usuario mientras el modelo generaba). Preserva la protección de "abort
// atómico" que hoy vive en el whatsapp-handler, ahora que las acciones corren
// en vivo durante la generación en vez de al final del turno.
//
// Todo en memoria del proceso vivo: internal-api y whatsapp-handler comparten
// la misma instancia (cache de require de Node). El MCP server (proceso aparte)
// NO toca esto: pasa su turnStartTs en el body de /accion y la internal-api
// compara acá.

const _lastInboundByUsuario = new Map(); // usuarioId -> ts (ms epoch)

function setLastInbound(usuarioId, ts = Date.now()) {
  if (usuarioId == null) return;
  _lastInboundByUsuario.set(Number(usuarioId), ts);
}

function getLastInbound(usuarioId) {
  if (usuarioId == null) return null;
  return _lastInboundByUsuario.get(Number(usuarioId)) || null;
}

module.exports = { setLastInbound, getLastInbound };
