// follow-ups.js — loop que dispara follow-ups vencidos.
//
// Cuando un usuario le pide a Maria "si X no me responde en N días,
// recordame", el LLM emite la acción crear_follow_up que persiste en la
// tabla follow_ups con vence_en = now + N días.
//
// Este loop corre cada N minutos. Para cada follow_up abierto vencido:
//   1) ¿Hubo entrante de `esperando_de` después de `creado`? Si sí → cerrar
//      como "cumplido" (no avisamos al user, no hace falta).
//   2) Si no → marcar como disparado y mandar WA al usuario avisándole que
//      X no respondió.
//
// MVP: solo "avisar al owner". v2 podría agregar "re-pingar al tercero
// automáticamente" pero eso requiere el LLM (no es solo reenviar el msg
// original). Por ahora avisamos y el LLM decide qué hacer en el próximo turno.

const mem = require('./memory');
const usuarios = require('./usuarios');
const waSend = require('./wa-send');

async function tick(waClient) {
  if (!waClient) return;
  const vencidos = mem.followUpsVencidos();
  if (!vencidos.length) return;

  for (const f of vencidos) {
    try {
      // ¿Hubo respuesta desde que se creó el follow-up?
      const respondio = mem.huboRespuesta({
        usuarioId: f.usuario_id,
        esperandoDe: f.esperando_de,
        esperandoCanal: f.esperando_canal,
        desde: f.creado,
      });

      if (respondio) {
        mem.setFollowUpEstado(f.id, 'cerrado');
        mem.log({
          usuarioId: f.usuario_id,
          canal: 'sistema', direccion: 'interno',
          cuerpo: `follow-up #${f.id} cerrado: ${f.esperando_de} respondió antes del vencimiento (${f.descripcion})`,
          metadata: { followUpId: f.id, esperando_de: f.esperando_de },
        });
        console.log(`[follow-ups] #${f.id} cerrado: hubo respuesta de ${f.esperando_de}`);
        continue;
      }

      // No hubo respuesta → avisar al usuario
      const usuario = usuarios.obtener(f.usuario_id);
      if (!usuario) {
        console.warn(`[follow-ups] #${f.id}: usuario ${f.usuario_id} no existe — marco cancelado`);
        mem.setFollowUpEstado(f.id, 'cancelado');
        continue;
      }

      const texto = `⏰ Follow-up vencido — ${f.descripcion}\n\n${f.esperando_de} no respondió todavía. ¿Querés que le mande un recordatorio o lo dejamos?`;

      try {
        await waSend.enviarWAUsuario(waClient, usuario, texto, {
          tag: `follow-ups/${usuario.nombre}`,
          metadata: { tipo: 'follow_up_disparado', followUpId: f.id, esperando_de: f.esperando_de },
          diferible: true, tz: usuario.tz,
        });
        mem.setFollowUpEstado(f.id, 'disparado');
        console.log(`[follow-ups] #${f.id} disparado → ${usuario.nombre} (${f.esperando_de} no respondió)`);
      } catch (err) {
        console.error(`[follow-ups] #${f.id} fallo enviar al user ${usuario.nombre}: ${err.message}`);
        // No marcamos disparado para que se reintente en el próximo tick.
      }
    } catch (err) {
      console.error(`[follow-ups] tick #${f.id} fallo:`, err.message);
    }
  }
}

function iniciarFollowUps({ waClient, intervaloMs = 5 * 60_000 } = {}) {
  console.log('[follow-ups] activo, cada 5min');
  // Tick inicial al boot (por si quedaron vencidos durante un downtime).
  tick(waClient).catch(err => console.error('[follow-ups] tick inicial:', err.message));
  return setInterval(() => {
    tick(waClient).catch(err => console.error('[follow-ups] tick:', err.message));
  }, intervaloMs);
}

module.exports = { iniciarFollowUps, tick };
