// wa-hook-watchdog.js — avisa al owner si un canal de ENTRADA deja de dar
// señales. Nació el 2026-08-14 para el teléfono, tras 4 días de silencio
// ambiguo; desde el 2026-08-23 vigila también el poll de Gmail, que tenía
// exactamente el mismo problema: sólo logueaba cuando había mail nuevo, así
// que "no llegó nada" y "el poll murió" se veían idénticos.
//
// El canal WA v2 no tiene heartbeat: si nadie escribe, no hay requests. Este
// loop mira el marker wa-hook-latido y, si supera el umbral, avisa UNA vez
// por el canal del owner (TG/email) y otra al recuperarse.

const fs = require('fs');
const path = require('path');
const mem = require('./memory');
const usuarios = require('./usuarios');
const waHook = require('./wa-hook');

const UMBRAL_MS = Number(process.env.WA_HOOK_SILENCIO_MS || 12 * 3600 * 1000); // 12h
// Gmail se pollea cada 5 min: 2h de silencio del LOOP (no de mails) ya es raro.
const UMBRAL_GMAIL_MS = Number(process.env.GMAIL_SILENCIO_MS || 2 * 3600 * 1000);
const _stateDir = path.dirname(path.dirname(process.env.MARIA_DB || './db/x'));
const AVISADO_F = path.join(_stateDir, 'wa-hook-avisado');
const AVISADO_GMAIL_F = path.join(_stateDir, 'gmail-avisado');

async function _avisarOwner(texto) {
  const owner = usuarios.obtenerOwner();
  if (!owner) return;
  try {
    await require('./wa-send').enviarWAUsuario(null, owner, texto, { tag: 'wa-hook-watchdog' });
  } catch (e) {
    console.warn('[wa-hook-watchdog] no pude avisar al owner:', e.message);
  }
}

async function _tickGmail() {
  let ultimo = 0;
  try { ultimo = require('./gmail-handler').ultimoLatidoGmail(); } catch { return; }
  if (!ultimo) return;   // todavía no latió nunca (recién arrancado)
  const silencio = Date.now() - ultimo;
  const yaAvisado = fs.existsSync(AVISADO_GMAIL_F);

  if (silencio > UMBRAL_GMAIL_MS && !yaAvisado) {
    const horas = (silencio / 3600e3).toFixed(1);
    try { fs.writeFileSync(AVISADO_GMAIL_F, String(Date.now())); } catch {}
    console.warn(`[wa-hook-watchdog] el poll de Gmail no completa una ronda hace ${horas}h`);
    mem.log({ canal: 'sistema', direccion: 'interno',
      cuerpo: `poll de Gmail sin completar rondas hace ${horas}h — aviso enviado`,
      metadata: { tipo: 'gmail_poll_silencio' } });
    await _avisarOwner(`⚠️ Mi lectura de mails no está completando rondas hace ${horas}h. Puede ser un problema de credenciales de Google o de red. Ojo que los mails que lleguen mientras tanto NO los estoy viendo.`);
    return;
  }
  if (silencio <= UMBRAL_GMAIL_MS && yaAvisado) {
    try { fs.unlinkSync(AVISADO_GMAIL_F); } catch {}
    mem.log({ canal: 'sistema', direccion: 'interno', cuerpo: 'poll de Gmail normalizado', metadata: { tipo: 'gmail_poll_recuperado' } });
    await _avisarOwner('✅ La lectura de mails volvió a la normalidad.');
  }
}

async function tick() {
  await _tickGmail().catch(e => console.warn('[wa-hook-watchdog] gmail:', e.message));
  const ultimo = waHook.ultimoLatido();
  if (!ultimo) return; // nunca hubo latido (canal recién montado): no alarmar
  const silencio = Date.now() - ultimo;
  const yaAvisado = fs.existsSync(AVISADO_F);

  if (silencio > UMBRAL_MS && !yaAvisado) {
    const horas = Math.round(silencio / 3600e3);
    try { fs.writeFileSync(AVISADO_F, String(Date.now())); } catch {}
    const msg = `⚠️ El teléfono de WhatsApp no da señales hace ${horas}h. Puede ser que simplemente nadie escribió, o que AutoResponder se haya dormido. Chequeá en el Moto: wifi, la regla en ON, permiso de notificaciones y batería sin restricción.`;
    console.warn(`[wa-hook-watchdog] silencio de ${horas}h — aviso al owner`);
    mem.log({ canal: 'sistema', direccion: 'interno', cuerpo: `wa-hook sin señales hace ${horas}h — aviso enviado`, metadata: { tipo: 'wa_hook_silencio' } });
    await _avisarOwner(msg);
    return;
  }

  if (silencio <= UMBRAL_MS && yaAvisado) {
    try { fs.unlinkSync(AVISADO_F); } catch {}
    console.log('[wa-hook-watchdog] teléfono volvió a dar señales');
    mem.log({ canal: 'sistema', direccion: 'interno', cuerpo: 'wa-hook: el teléfono volvió a dar señales', metadata: { tipo: 'wa_hook_recuperado' } });
    await _avisarOwner('✅ El teléfono de WhatsApp volvió a dar señales — canal normalizado.');
  }
}

function iniciarWaHookWatchdog({ intervaloMs = 30 * 60 * 1000 } = {}) {
  console.log(`[wa-hook-watchdog] activo (cada ${intervaloMs / 60000}min — teléfono ${UMBRAL_MS / 3600e3}h, gmail ${UMBRAL_GMAIL_MS / 3600e3}h)`);
  tick().catch(e => console.error('[wa-hook-watchdog] tick inicial:', e.message));
  return setInterval(() => tick().catch(e => console.error('[wa-hook-watchdog] tick:', e.message)), intervaloMs);
}

module.exports = { iniciarWaHookWatchdog, tick };
