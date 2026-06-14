// recordatorios.js — re-ping de pendientes POR usuario por WhatsApp
//
// Solo entran al loop los pendientes con dueno='usuario'. Los de dueno='maria'
// son tareas que Maria ejecuta sola — no se pingan a nadie.
//
// Por disparador:
//   · respuesta_usuario → Maria espera que el usuario conteste algo.
//                          UMBRAL 2h, COOLDOWN 3h (insiste rápido).
//   · manual            → el usuario se anotó una tarea para hacer él.
//                          UMBRAL 24h, COOLDOWN 24h (una vez por día).
//   · trigger_externo   → NO pinguea. Espera el trigger; el LLM lo cierra.
//
// Si un pendiente tiene `recordar_desde` seteado, el loop lo ignora hasta
// que esa fecha pase (postpone explícito vía posponer_pendiente).
//
// Multi-user: iteramos usuarios.listarServidos(). Cada usuario tiene sus
// propios pendientes, su propio cooldown (en estado_usuario) y su propio
// destino WA (wa_lid || wa_cus).

const mem = require('./memory');
const usuarios = require('./usuarios');
const waSend = require('./wa-send');

const CONSULTA_UMBRAL_H   = Number(process.env.RECORDATORIO_CONSULTA_UMBRAL_H   || 2);
const CONSULTA_COOLDOWN_H = Number(process.env.RECORDATORIO_CONSULTA_COOLDOWN_H || 3);
const TAREA_UMBRAL_H      = Number(process.env.RECORDATORIO_TAREA_UMBRAL_H     || 24);
const TAREA_COOLDOWN_H    = Number(process.env.RECORDATORIO_TAREA_COOLDOWN_H   || 24);

const KEY_ULT_CONSULTA = 'ultimo_recordatorio_consultas';
const KEY_ULT_TAREA    = 'ultimo_recordatorio_tareas';

// Cada bucket = un disparador procesable, con su cooldown y su copy.
const BUCKETS = {
  respuesta_usuario: {
    umbralH:    CONSULTA_UMBRAL_H,
    cooldownH:  CONSULTA_COOLDOWN_H,
    keyGlobal:  KEY_ULT_CONSULTA,
    encabezado: (n) => `Te debo consulta sobre ${n === 1 ? 'algo pendiente' : `${n} cosas pendientes`} 👇`,
    cierre:     'Decime qué hago con cada uno.',
  },
  manual: {
    umbralH:    TAREA_UMBRAL_H,
    cooldownH:  TAREA_COOLDOWN_H,
    keyGlobal:  KEY_ULT_TAREA,
    encabezado: (n) => `Recordatorio — ${n === 1 ? 'tenés 1 tarea' : `tenés ${n} tareas`} abiertas 📝`,
    cierre:     'Cuando termines alguna decime "listo <nombre>" y la saco.',
  },
};

function _horasDesde(isoTs) {
  if (!isoTs) return Infinity;
  // SQLite guarda CURRENT_TIMESTAMP como "YYYY-MM-DD HH:MM:SS" en UTC sin
  // zona; new Date() lo parsearía como hora LOCAL (TZ=ART) corriendo todo
  // 3 horas (umbrales y edad mostrada). Normalizamos a UTC explícito —
  // mismo criterio que memory._tsLocal. Fix 2026-06-09.
  let s = String(isoTs).trim();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(s)) s = s.replace(' ', 'T') + 'Z';
  else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s) && !/[Zz]|[+-]\d{2}:?\d{2}$/.test(s)) s = s + 'Z';
  const t = new Date(s).getTime();
  if (isNaN(t)) return Infinity;
  return (Date.now() - t) / 3_600_000;
}

function _destinoWA(usuario) {
  return usuario.wa_lid || usuario.wa_cus || null;
}

function _formatearTexto(disparador, candidatos) {
  const cfg = BUCKETS[disparador];
  const lineas = candidatos.map((p, i) => {
    const partes = [p.desc];
    if (disparador === 'respuesta_usuario' && p.meta?.remitente) partes.push(`de ${p.meta.remitente}`);
    if (p.creado) {
      const h = Math.floor(_horasDesde(p.creado));
      if (h >= 1) partes.push(`${h}h`);
    }
    return `${i + 1}. ${partes.join(' — ')}`;
  });
  return `${cfg.encabezado(candidatos.length)}\n\n${lineas.join('\n')}\n\n${cfg.cierre}`;
}

/**
 * Procesa UN disparador para UN usuario. Devuelve { enviado, cuantos, motivo }.
 */
async function _procesarDisparadorUsuario(disparador, usuario, pendientes, { waClient }) {
  const cfg = BUCKETS[disparador];
  const destino = _destinoWA(usuario);
  if (!destino) return { enviado: false, motivo: 'sin-destino-wa' };

  const ultimoGlobal = mem.getEstadoUsuario(usuario.id, cfg.keyGlobal);
  if (ultimoGlobal && _horasDesde(ultimoGlobal) < cfg.cooldownH) {
    return { enviado: false, motivo: 'cooldown-global' };
  }

  const ahoraMs = Date.now();
  const candidatos = pendientes.filter(p => {
    if (p.dueno !== 'usuario') return false;
    if (p.disparador !== disparador) return false;
    if (p.recordar_desde) {
      const t = new Date(p.recordar_desde).getTime();
      if (!isNaN(t) && t > ahoraMs) return false;
    }
    const edad = _horasDesde(p.creado);
    if (edad < cfg.umbralH) return false;
    const ultimoPing = p.ultimo_recordatorio || p.meta?.ultimo_recordatorio;
    if (ultimoPing && _horasDesde(ultimoPing) < cfg.cooldownH) return false;
    return true;
  });

  if (!candidatos.length) return { enviado: false, motivo: 'sin-candidatos' };

  const texto = _formatearTexto(disparador, candidatos);

  let destinoFinal;
  let _diferido = false;
  try {
    const r = await waSend.enviarWAUsuario(waClient, usuario, texto, {
      tag: `recordatorios/${usuario.nombre}/${disparador}`,
      metadata: { tipo: 'recordatorio', disparador, cuantos: candidatos.length },
      diferible: true, tz: usuario.tz,
    });
    destinoFinal = r.destinoFinal;
    _diferido = !!r.diferido;
  } catch (err) {
    console.error(`[recordatorios/${usuario.nombre}/${disparador}] falló sendMessage:`, err.message);
    mem.log({
      usuarioId: usuario.id,
      canal: 'sistema', direccion: 'interno',
      cuerpo: `recordatorio ${disparador} falló: ${err.message}`,
      metadata: { destino, cuantos: candidatos.length, disparador },
    });
    return { enviado: false, motivo: 'error', error: err.message };
  }

  const ahora = new Date().toISOString();
  for (const c of candidatos) {
    mem.marcarRecordatorioPendiente(c.id, ahora);
  }
  mem.setEstadoUsuario(usuario.id, cfg.keyGlobal, ahora);

  if (_diferido) console.log(`[recordatorios/${usuario.nombre}/${disparador}] en silencio → diferido (${candidatos.length})`);
  else console.log(`[recordatorios/${usuario.nombre}/${disparador}] ping → ${destinoFinal} (${candidatos.length})`);

  return { enviado: true, cuantos: candidatos.length };
}

/**
 * Una pasada del loop: para cada usuario activo procesa los dos buckets que
 * pingan (respuesta_usuario y manual). trigger_externo no entra acá.
 */
async function tickOnce({ waClient } = {}) {
  if (!waClient) return { enviado: false, motivo: 'no-waClient' };

  const activos = usuarios.listarServidos();
  const resultados = [];
  for (const u of activos) {
    const pendientes = mem.listarPendientes(u.id);
    if (!pendientes.length) continue;
    const resConsulta = await _procesarDisparadorUsuario('respuesta_usuario', u, pendientes, { waClient });
    const resTarea    = await _procesarDisparadorUsuario('manual',            u, pendientes, { waClient });
    resultados.push({ usuario: u.nombre, consulta: resConsulta, tarea: resTarea });
  }
  return { resultados };
}

/**
 * Loop periódico. Devuelve el handle del setInterval.
 */
function iniciarRecordatorios({ waClient, intervaloMs = 30 * 60_000 } = {}) {
  const tick = () => {
    tickOnce({ waClient }).catch(err =>
      console.error('[recordatorios] tick error:', err.message)
    );
  };
  // No arrancamos con un tick inmediato — damos tiempo a que los usuarios
  // manden algún mensaje y capturemos su @lid antes del primer ping.
  return setInterval(tick, intervaloMs);
}

module.exports = { iniciarRecordatorios, tickOnce };
