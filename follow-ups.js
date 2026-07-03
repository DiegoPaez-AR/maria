// follow-ups.js — loop que dispara follow-ups vencidos.
//
// Cuando un usuario le pide a Maria "si X no me responde en N días,
// recordame", el LLM emite la acción crear_follow_up que persiste en la
// tabla follow_ups con vence_en = now + N días. También los crea el executor
// automáticamente cuando Maria hace outreach a un tercero (pendiente
// dueno=maria + meta.esperando_de → follow_up de seguridad).
//
// Este loop corre cada N minutos. Para cada follow_up abierto vencido:
//   1) ¿Hubo entrante de `esperando_de` después de `creado`? Si sí → cerrar
//      como "cumplido" (no avisamos al user, no hace falta).
//   2) Si no, y todavía no insistimos (re_pings=0, canal whatsapp) →
//      RE-PING AUTOMÁTICO AL TERCERO (v2, 2026-07-03 — caso follow-up #19
//      Gabi/Ana Clara): mensaje corto generado por LLM con la conversación
//      reciente como contexto, destino validado + moderación outbound.
//      Se reprograma vence_en (+2 días) y NO se molesta al dueño.
//   3) Si ya insistimos una vez, o el re-ping no es viable (destino que no
//      valida, LLM sin contexto claro, moderación bloquea, envío falla) →
//      marcar disparado y avisar al dueño (comportamiento v1).
//
// 2026-07-03 (mismo día, pedido de Diego): re-ping también para canal gmail
// (caso follow-up #24 Ana Clara). El contexto sale de eventosGmailCon (los
// salientes de enviar_email guardan el destino solo en metadata_json) y el
// envío va por google.enviarEmail con asunto "Re: <último asunto>".

const mem = require('./memory');
const usuarios = require('./usuarios');
const waSend = require('./wa-send');
const seguridad = require('./seguridad');
const moderacion = require('./moderacion');
const { invocarClaudeJSON } = require('./claude-client');

const REPING_DIAS = 2; // ventana antes de escalar al dueño tras insistir

const SYSTEM_REPING = `Sos Maria, una asistente personal. Tenés que escribir UN mensaje corto (el encabezado del pedido te dice si es WhatsApp o email) para insistirle amablemente a alguien que todavía no respondió un pedido que vos ya le hiciste (en nombre del usuario al que asistís).

Reglas:
- WhatsApp: máximo 2-3 oraciones. Email: máximo 4-6 oraciones, con saludo inicial y cierre firmado "Maria". Tono cordial y natural, consistente con tus mensajes previos de la conversación y en el mismo idioma.
- Referí SOLO a lo que ya se pidió en la conversación; no inventes datos, fechas ni compromisos nuevos.
- No menciones sistemas internos, pendientes ni que sos un bot.
- Si la conversación NO muestra un pedido pendiente claro al que valga la pena insistir, devolvé mensaje null.

Respondé SOLO con JSON válido, sin markdown:
{"mensaje": "<texto del recordatorio>" | null}`;

// Genera el texto del re-ping con el LLM. Devuelve string o null (null =
// no hay contexto suficiente / el modelo prefirió no insistir).
async function _generarReping(f, usuario) {
  const canal = f.esperando_canal || 'whatsapp';
  let historial = [];
  try {
    historial = canal === 'gmail'
      ? mem.eventosGmailCon({ usuarioId: f.usuario_id, email: f.esperando_de, max: 15 })
      : mem.eventosConContactoDesde({
          usuarioId: f.usuario_id,
          contacto: { whatsapp: f.esperando_de },
          max: 500,
        }).slice(-15);
  } catch (err) {
    console.warn(`[follow-ups] #${f.id} historial para re-ping falló: ${err.message}`);
    return null;
  }
  const conv = historial
    .filter(e => (canal === 'gmail' ? e.canal === 'gmail' : e.canal === 'whatsapp') && String(e.cuerpo || '').trim())
    .map(e => `[${String(e.timestamp).slice(0, 16)} UTC] ${e.direccion === 'entrante' ? 'LA OTRA PERSONA' : 'MARIA'}: ${e.asunto ? '(asunto: ' + String(e.asunto).slice(0, 80) + ') ' : ''}${String(e.cuerpo).slice(0, 400)}`)
    .join('\n');
  if (!conv.trim()) return null;

  const user = [
    `Canal del recordatorio: ${canal === 'gmail' ? 'EMAIL' : 'WhatsApp'}`,
    `Usuario al que asistís: ${usuario.nombre}`,
    `Recordatorio interno del pedido (contexto, NO citar textual): ${f.descripcion}`,
    `Conversación reciente (${canal === 'gmail' ? 'emails' : 'WhatsApp'}) con la persona que no respondió:`,
    '"""',
    conv,
    '"""',
  ].join('\n');

  const { json } = await invocarClaudeJSON(
    { system: SYSTEM_REPING, user },
    {
      timeoutMs: 90000, idleTimeoutMs: 45000,
      audit: { usuarioId: f.usuario_id, canal: 'follow-ups' },
    }
  );
  const msg = json && typeof json.mensaje === 'string' ? json.mensaje.trim() : null;
  return msg && msg.length >= 10 ? msg : null;
}

// Intenta el re-ping automático al tercero. Devuelve true si lo mandó (el
// follow-up quedó reprogramado, NO avisar al dueño); false si el caller debe
// caer al aviso v1.
async function _intentarReping(waClient, f, usuario) {
  const canal = f.esperando_canal || 'whatsapp';
  if (canal !== 'whatsapp' && canal !== 'gmail') return false;
  const meta = f.metadata || {};
  if ((Number(meta.re_pings) || 0) >= 1) return false;

  const v = seguridad.validarDestinatario({
    usuario,
    canal: canal === 'gmail' ? 'email' : 'wa',
    destino: f.esperando_de,
  });
  if (!v.ok) {
    console.warn(`[follow-ups] #${f.id} re-ping: destino ${f.esperando_de} no valida (${v.motivo}) — aviso al dueño`);
    return false;
  }

  let msg = null;
  try {
    msg = await _generarReping(f, usuario);
  } catch (err) {
    console.warn(`[follow-ups] #${f.id} re-ping: LLM falló (${err.message}) — aviso al dueño`);
    return false;
  }
  if (!msg) {
    console.log(`[follow-ups] #${f.id} re-ping: sin contexto suficiente — aviso al dueño`);
    return false;
  }

  const rMod = await moderacion.revisarSaliente(msg);
  if (rMod.bloquear) {
    console.warn(`[follow-ups] #${f.id} re-ping: moderación bloqueó (${rMod.categoria}/${rMod.severidad}) — aviso al dueño`);
    return false;
  }

  // CLAIM antes del send (mismo patrón que el dispatch v1): reprogramar
  // vence_en + marcar re_pings PRIMERO, así un send colgado no duplica en
  // el próximo tick. Si el send tira, caemos al aviso v1 (que marca
  // 'disparado' y corta el ciclo igual).
  const nuevoVence = new Date(Date.now() + REPING_DIAS * 24 * 3600 * 1000)
    .toISOString().replace('T', ' ').slice(0, 19);
  mem.reprogramarFollowUp(f.id, {
    venceEn: nuevoVence,
    metadata: { ...meta, re_pings: (Number(meta.re_pings) || 0) + 1, re_ping_en: new Date().toISOString() },
  });

  try {
    if (canal === 'gmail') {
      // Asunto: "Re:" del último email del hilo con esa persona (si hay).
      let asunto = 'Seguimiento';
      try {
        const evs = mem.eventosGmailCon({ usuarioId: f.usuario_id, email: f.esperando_de, max: 15 });
        const conAsunto = evs.filter(e => String(e.asunto || '').trim()).pop();
        if (conAsunto) {
          const a = String(conAsunto.asunto).trim();
          asunto = /^re:/i.test(a) ? a : `Re: ${a}`;
        }
      } catch { /* asunto default */ }
      const g = require('./google'); // lazy: google.js exige env de identidad al require
      const r = await g.enviarEmail({ to: f.esperando_de, asunto, texto: msg });
      mem.log({
        usuarioId: f.usuario_id,
        canal: 'gmail', direccion: 'saliente',
        asunto, cuerpo: msg,
        metadata: { tipo: 'follow_up_reping', followUpId: f.id, to: f.esperando_de, messageId: r?.id || null },
      });
    } else {
      await waSend.enviarWADirecto(waClient, f.esperando_de, msg, {
        tag: `follow-ups/re-ping`,
        usuarioId: f.usuario_id,
        metadata: { tipo: 'follow_up_reping', followUpId: f.id, esperando_de: f.esperando_de },
        diferible: true, // horas de silencio del destino (o default) aplican
      });
    }
  } catch (err) {
    console.error(`[follow-ups] #${f.id} re-ping: envío falló (${err.message}) — aviso al dueño`);
    return false;
  }

  mem.log({
    usuarioId: f.usuario_id,
    canal: 'sistema', direccion: 'interno',
    cuerpo: `follow-up #${f.id} re-ping automático a ${f.esperando_de} — reprogramado a ${nuevoVence} (${f.descripcion})`,
    metadata: { tipo: 'follow_up_reping', followUpId: f.id, esperando_de: f.esperando_de },
  });
  console.log(`[follow-ups] #${f.id} re-ping (${canal}) → ${f.esperando_de} (nuevo vencimiento ${nuevoVence} UTC)`);
  return true;
}

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

      const usuario = usuarios.obtener(f.usuario_id);
      if (!usuario) {
        console.warn(`[follow-ups] #${f.id}: usuario ${f.usuario_id} no existe — marco cancelado`);
        mem.setFollowUpEstado(f.id, 'cancelado');
        continue;
      }

      // v2: primero intentamos insistirle al tercero directamente.
      if (await _intentarReping(waClient, f, usuario)) continue;

      // v1: avisar al dueño (o porque ya insistimos, o porque no se pudo).
      const yaInsistio = (Number((f.metadata || {}).re_pings) || 0) >= 1;
      const texto = yaInsistio
        ? `⏰ Follow-up vencido — ${f.descripcion}\n\nLe mandé un recordatorio a ${f.esperando_de} y sigue sin responder. ¿Querés que le insista de nuevo o lo dejamos?`
        : `⏰ Follow-up vencido — ${f.descripcion}\n\n${f.esperando_de} no respondió todavía. ¿Querés que le mande un recordatorio o lo dejamos?`;

      // CLAIM antes del send (2026-07-02, patrón de programados): si el envío
      // se cuelga >5min sin resolver, el tick siguiente veía el follow-up
      // todavía 'abierto' y re-avisaba. Claim primero; si el send falla de
      // verdad (throw), revertimos y el próximo tick reintenta.
      mem.setFollowUpEstado(f.id, 'disparado');
      try {
        await waSend.enviarWAUsuario(waClient, usuario, texto, {
          tag: `follow-ups/${usuario.nombre}`,
          metadata: { tipo: 'follow_up_disparado', followUpId: f.id, esperando_de: f.esperando_de },
          diferible: true, tz: usuario.tz,
        });
        console.log(`[follow-ups] #${f.id} disparado → ${usuario.nombre} (${f.esperando_de} no respondió)`);
      } catch (err) {
        console.error(`[follow-ups] #${f.id} fallo enviar al user ${usuario.nombre}: ${err.message}`);
        try { mem.setFollowUpEstado(f.id, 'abierto'); } catch {}
        // Revertido a 'abierto' para que se reintente en el próximo tick.
      }
    } catch (err) {
      console.error(`[follow-ups] tick #${f.id} fallo:`, err.message);
    }
  }
}

function iniciarFollowUps({ waClient, intervaloMs = 5 * 60_000 } = {}) {
  console.log('[follow-ups] activo, cada 5min (re-ping automático a terceros: ON)');
  // Tick inicial al boot (por si quedaron vencidos durante un downtime).
  tick(waClient).catch(err => console.error('[follow-ups] tick inicial:', err.message));
  return setInterval(() => {
    tick(waClient).catch(err => console.error('[follow-ups] tick:', err.message));
  }, intervaloMs);
}

module.exports = { iniciarFollowUps, tick, _generarReping, _intentarReping };
