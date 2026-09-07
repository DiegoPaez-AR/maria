// mb-verif.js — veredicto por FOTO de un cold-send (2026-09-07, caso Walby).
//
// El 5/9 MariaBridge dijo "entregado" con el mensaje trabado en el cuadro de
// texto: la verificación leía por AUSENCIA (entry vacío o sin botón) y una
// lectura con root null pasaba como OK. Desde v4.7 la app verifica con
// evidencia positiva y, si el árbol de accesibilidad no alcanza para decidir,
// manda un screenshot acá. Un modelo con visión (haiku, barato) responde:
//   enviado  → la burbuja del mensaje está en el chat (derecha, con tilde)
//   trabado  → el texto sigue en el cuadro de escritura, sin enviar
//   otro     → no es ese chat / diálogo / no se puede decidir
// La app decide con eso: enviado → confirmar; trabado → mbfallo (el server
// lo re-sirve UNA vez y toca send sobre el borrador); otro → mbfallo normal.
//
// FAIL-CLOSED: si el modelo falla o el JSON no viene, devolvemos 'otro' — un
// juez que no ve NO confirma. La foto se publica en intensa.io/_dl igual que los shots de
// manos remotas, y la URL queda en metadata del outbox para el aviso al owner.

const fs = require('fs');
const crypto = require('crypto');
const { invocarClaudeJSON } = require('./claude-client');

const PUB_DIR = '/var/www/intensa.io/_dl';
const PUB_URL = 'https://intensa.io/_dl';
const _modelo = () => process.env.MARIA_VERIF_MODEL || process.env.MARIA_MOD_MODEL || 'haiku';

const SYSTEM = `Sos un verificador visual. Te dan una captura de pantalla de WhatsApp en Android tomada segundos después de que un automatismo tocó "enviar" en un chat. Tu única tarea: decir si el mensaje indicado quedó ENVIADO.

Respondé SOLO JSON válido, sin markdown:
{"veredicto": "enviado" | "trabado" | "otro", "motivo": "<máx 12 palabras>"}

Reglas:
- "enviado": el texto del mensaje (o su comienzo) aparece como BURBUJA en la conversación, alineada a la derecha (color de saliente), con hora y tilde(s) o reloj. El cuadro de escritura de abajo está vacío o con placeholder ("Mensaje", "Message").
- "trabado": el texto del mensaje está DENTRO del cuadro de escritura de abajo (todavía sin enviar), aunque el botón de enviar esté visible.
- "otro": la pantalla no es ese chat (es otra conversación, la lista de chats, un diálogo, la pantalla de inicio, un teclado tapando todo), o no podés distinguir.
- Si el texto aparece a la vez como burbuja Y en el cuadro (envío duplicado en curso), respondé "enviado".
- Ante la duda entre enviado y otra cosa, NO digas "enviado".`;

function _publicar(buf, id) {
  try {
    const nombre = `verif-${id}-${crypto.randomBytes(4).toString('hex')}.png`;
    fs.mkdirSync(PUB_DIR, { recursive: true });
    fs.writeFileSync(`${PUB_DIR}/${nombre}`, buf);
    try { fs.chmodSync(`${PUB_DIR}/${nombre}`, 0o644); } catch { /* noop */ }
    return `${PUB_URL}/${nombre}`;
  } catch (e) { console.warn('[mb-verif] publicar falló:', e.message); return null; }
}

/**
 * @param {{id, data(base64 png), numero?, nombre?, texto?, estado_arbol?}} b
 * @returns {{veredicto:'enviado'|'trabado'|'otro', motivo, url}}
 */
async function verificar(b) {
  const id = Number(b.id);
  const buf = Buffer.from(String(b.data || ''), 'base64');
  if (!id || buf.length < 1000) return { veredicto: 'otro', motivo: 'sin foto', url: null };
  const url = _publicar(buf, id);
  const tmp = `/tmp/maria-attach-verif-${id}-${Date.now()}.png`;   // prefijo maria-attach-* = bwrap lo bind-montea
  fs.writeFileSync(tmp, buf);
  const texto = String(b.texto || '').slice(0, 300);
  const quien = [b.nombre, b.numero].filter(Boolean).join(' / ') || 'desconocido';
  let veredicto = 'otro', motivo = null;
  try {
    const { json } = await invocarClaudeJSON(
      {
        system: SYSTEM,
        user: `Destinatario esperado: ${quien}\nEstado según el árbol de accesibilidad de la app: ${b.estado_arbol || '?'}\nMensaje que se intentó enviar:\n"""\n${texto}\n"""\n\nMirá la captura con tu tool Read y respondé.\n@${tmp}`,
      },
      {
        timeoutMs: 50000, idleTimeoutMs: 30000,
        extraArgs: ['--model', _modelo()],
        audit: { usuarioId: null, canal: 'mb-verif' },
      }
    );
    if (json && ['enviado', 'trabado', 'otro'].includes(json.veredicto)) {
      veredicto = json.veredicto; motivo = json.motivo || null;
    } else motivo = 'json inválido';
  } catch (e) {
    motivo = `modelo falló: ${e.message}`;
  } finally {
    try { fs.unlinkSync(tmp); } catch { /* noop */ }
  }
  console.log(`[MB-VERIF] #${id} árbol=${b.estado_arbol || '?'} → ${veredicto}${motivo ? ` (${motivo})` : ''} ${url || ''}`);
  // rastro en el outbox (la URL sirve para el aviso al owner si termina vencido)
  try {
    const mem = require('./memory');
    const row = mem.db.prepare(`SELECT metadata_json FROM wa_outbox WHERE id = ?`).get(id);
    if (row) {
      let meta = {}; try { meta = JSON.parse(row.metadata_json || '{}'); } catch { /* noop */ }
      meta.verif_foto = { veredicto, motivo, url, arbol: b.estado_arbol || null, ts: new Date().toISOString() };
      mem.db.prepare(`UPDATE wa_outbox SET metadata_json = ? WHERE id = ?`).run(JSON.stringify(meta), id);
    }
    mem.log({ canal: 'sistema', direccion: 'interno',
      cuerpo: `mb-verif: cold-send #${id} a ${quien} — veredicto por foto: ${veredicto}${motivo ? ` (${motivo})` : ''}`,
      metadata: { tipo: 'mb_verif', outboxId: id, veredicto, url } });
  } catch { /* noop */ }
  return { veredicto, motivo, url };
}

module.exports = { verificar };
