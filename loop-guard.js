// loop-guard.js — vigilancia de loops periódicos (2026-06-13, Opción A).
//
// Problema: los loops periódicos (meeting-prep, gmail-poll, calendar-watch…)
// atrapan sus errores y siguen martillando cada ciclo sin avisar. El incidente
// del 2026-06-13 (OAuth revocado) los dejó tirando invalid_grant cada minuto
// por horas sin notificar — solo el healthcheck aparte lo agarró.
//
// Solución (Opción A, elegida por Diego): tras N fallos consecutivos con la
// MISMA causa para una "clave", avisa al owner UNA vez (WA preferido — sobrevive
// a caídas de OAuth que también tumban el mail), silencia repeticiones, y cuando
// la causa se resuelve avisa "se recuperó". El loop NUNCA se frena: se autocura
// solo (a diferencia de programados, que sí pausa, porque es una cola discreta).
//
// Tuning: MARIA_LOOP_FALLOS_UMBRAL (default 3). Killswitch implícito: si nadie
// llama reportar(), no hace nada.

const usuarios = require('./usuarios');
const waSend = require('./wa-send');

let _waClient = null;
function setWaClient(c) { _waClient = c; }

const UMBRAL = Number(process.env.MARIA_LOOP_FALLOS_UMBRAL || 3);
const _estado = new Map(); // clave -> { count, errorKey, alertado }

function _key(err) { return String((err && err.message) || err || 'desconocido').slice(0, 120); }

async function _avisarOwner(texto) {
  try {
    const owner = usuarios.obtenerOwner();
    if (!owner) return;
    const dest = owner.wa_lid || owner.wa_cus;
    if (dest && _waClient) {
      await waSend.enviarWADirecto(_waClient, dest, texto, { tag: 'loop_guard', usuarioId: owner.id });
      return;
    }
    // Fallback mail (ojo: si la causa es el propio OAuth, esto también falla —
    // por eso WA es el canal preferido).
    if (owner.email) {
      const g = require('./google');
      await g.enviarEmail({ to: owner.email, asunto: 'Maria: loop con fallos repetidos', texto });
    }
  } catch (e) { console.warn('[loop-guard] aviso owner falló:', e.message); }
}

/**
 * Reporta el resultado de una operación vigilada. `clave` agrupa fallos de la
 * misma fuente (ej. 'acceso_google' para todos los loops que leen Google). Un
 * `ok` resetea el contador → un fallo puntual aislado no dispara alarma; solo
 * una RACHA sostenida de fallos sin ningún éxito intercalado llega al umbral.
 */
function reportar(clave, ok, err) {
  const st = _estado.get(clave);
  if (ok) {
    if (st && st.alertado) {
      _avisarOwner(`✅ *${clave}* se recuperó (venía fallando con: ${st.errorKey}). Vuelvo a la normalidad.`);
      console.log(`[loop-guard] ${clave} recuperado tras ${st.count} fallos`);
    }
    _estado.delete(clave);
    return;
  }
  const k = _key(err);
  const cur = (st && st.errorKey === k) ? st : { count: 0, errorKey: k, alertado: false };
  cur.count += 1;
  cur.errorKey = k;
  _estado.set(clave, cur);
  if (cur.count >= UMBRAL && !cur.alertado) {
    cur.alertado = true;
    _avisarOwner(`⚠️ *${clave}* falló ${cur.count} veces seguidas con la misma causa. Silencio este aviso hasta que se recupere.\n\nCausa: ${k}\n\n(Los loops siguen corriendo y se autocuran cuando se resuelva.)`);
    console.warn(`[loop-guard] ${clave} alertado al owner tras ${cur.count} fallos: ${k}`);
  }
}

/** Envuelve un tick: si tira error → reporta fallo; si vuelve → reporta ok. */
function guard(clave, fn) {
  return async (...args) => {
    try {
      const r = await fn(...args);
      reportar(clave, true);
      return r;
    } catch (err) {
      reportar(clave, false, err);
      throw err;
    }
  };
}

/** ¿Error de auth/transporte de Google? Para reportar solo lo relevante. */
function esErrorAccesoGoogle(err) {
  const m = String((err && err.message) || err || '').toLowerCase();
  return /invalid_grant|invalid credentials|unauthorized|\b401\b|\b403\b|token has been|econnreset|etimedout|enotfound|socket hang up/.test(m);
}

module.exports = { reportar, guard, setWaClient, esErrorAccesoGoogle, UMBRAL };
