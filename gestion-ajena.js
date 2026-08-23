// gestion-ajena.js — ruteo por IDENTIDAD, no por canal (Fase 1, 2026-08-16).
//
// Principio (diseño Diego): Maria es UNA sola persona con varios canales de
// contacto. Una conversación sigue a la PERSONA aunque salte de canal. Este
// módulo resuelve el caso "quien escribe ES usuario, pero hay gestiones
// abiertas de OTROS usuarios esperando su respuesta": detecta el match por
// CUALQUIER identificador de la persona (número de WA o email, sin importar
// por qué canal entró el mensaje) y un clasificador barato decide si el
// mensaje responde a esa gestión.
//
// Lo usan los adaptadores de canal (wa-hook, telegram-handler; gmail en Fase
// 2). Canales futuros solo tienen que llamar acá. Fail-open siempre: ante
// duda o error, el mensaje corre como turno propio del remitente.

const mem = require('./memory');
const usuarios = require('./usuarios');
const { invocarClaudeJSON } = require('./claude-client');

const tel = require('./telefonos');
function variantesAR(digs) { return tel.variantes(digs); }

// Identificadores conocidos de un usuario (para matchear esperando_de).
function _clavesDe(u) {
  const claves = [];
  const digs = String(u.wa_cus || '').replace(/\D/g, '');
  if (digs.length >= 8) claves.push(...variantesAR(digs));
  const email = String(u.email || '').trim().toLowerCase();
  if (email.includes('@')) claves.push(email);
  return claves;
}

/**
 * Si `u` (usuario remitente) tiene gestiones ABIERTAS de OTROS usuarios
 * esperándolo, clasifica si `cuerpo` las responde.
 * @returns {null | { due, gestion, descTxt }} — el adaptador de canal arma el
 *   turno de tercero con esto (contacto/de son cosa del canal).
 */
async function gestionAjenaRelacionada(u, cuerpo, { canal = '?' } = {}) {
  const claves = _clavesDe(u);
  if (!claves.length) return null;

  const likeP = claves.map(() => `meta_json LIKE '%' || ? || '%'`).join(' OR ');
  const pend = mem.db.prepare(
    `SELECT id, usuario_id, "desc" AS descTxt FROM pendientes
      WHERE estado='abierto' AND usuario_id != ? AND meta_json IS NOT NULL AND (${likeP})
      ORDER BY id DESC LIMIT 4`
  ).all(u.id, ...claves);
  const likeF = claves.map(() => `esperando_de LIKE '%' || ? || '%'`).join(' OR ');
  const fus = mem.db.prepare(
    `SELECT id, usuario_id, descripcion AS descTxt FROM follow_ups
      WHERE estado IN ('abierto','disparado') AND usuario_id != ? AND (${likeF})
      ORDER BY id DESC LIMIT 4`
  ).all(u.id, ...claves);

  const porDueno = new Map();
  for (const g of [...pend, ...fus]) if (!porDueno.has(g.usuario_id)) porDueno.set(g.usuario_id, g);
  const gestiones = [...porDueno.values()].slice(0, 4);
  if (!gestiones.length) return null;

  const lista = gestiones.map((g, i) => `${i + 1}. ${String(g.descTxt).slice(0, 220)}`).join('\n');
  const prompt = `Sos un clasificador de ruteo. ${u.nombre} mandó este mensaje (canal: ${canal}):
"${String(cuerpo).slice(0, 400)}"

Hay gestiones abiertas de OTRAS personas que esperan una respuesta de ${u.nombre}:
${lista}

¿El mensaje es una RESPUESTA a alguna de esas gestiones (confirma, rechaza, propone alternativa, o claramente habla de ESE tema)? ¿O es un pedido/tema propio de ${u.nombre} sin relación con esas gestiones?

Respondé SOLO este JSON, sin nada más: {"relacionado": true|false, "n": <número de la gestión relacionada, o null>}
Ante la MÍNIMA duda: {"relacionado": false, "n": null}.`;

  const { json } = await invocarClaudeJSON(prompt, {
    timeoutMs: 25000,
    extraArgs: ['--model', process.env.MARIA_MOD_MODEL || 'haiku'],
    // 🔴 SEGURIDAD (auditoría 22/8): usuarioId != null habilitaba las tools MCP
    // en un clasificador que recibe texto de un remitente → prompt injection
    // podía mandar WhatsApps/mails. Igual criterio que el pre-pass de Telegram.
    audit: { usuarioId: null, canal: `${canal}-gestion-ajena` },
  });
  if (!json || json.relacionado !== true || !json.n) return null;
  const g = gestiones[Number(json.n) - 1];
  if (!g) return null;
  const due = usuarios.obtener(g.usuario_id);
  if (!due || due.id === u.id) return null;

  mem.log({ usuarioId: due.id, canal: 'sistema', direccion: 'interno',
    cuerpo: `gestion-ajena: mensaje de ${u.nombre} (usuario, via ${canal}) ruteado como TERCERO a gestión de ${due.nombre} (#${g.id}: ${String(g.descTxt).slice(0, 80)})`,
    metadata: { tipo: 'usuario_como_tercero', canal, gestion: g.id, remitente_usuario: u.id } });
  return { due, gestion: g.id, descTxt: g.descTxt };
}

module.exports = { gestionAjenaRelacionada, variantesAR };
