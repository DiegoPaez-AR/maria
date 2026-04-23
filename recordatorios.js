// recordatorios.js — re-ping de pendientes POR usuario por WhatsApp
//
// Hay dos tipos de pendientes con reglas distintas:
//   · consulta → Maria le preguntó algo al usuario y espera respuesta.
//                 UMBRAL 2h, COOLDOWN 3h (insiste rápido si no contestó).
//   · tarea    → el usuario mismo se anotó algo para hacer él.
//                 UMBRAL 24h, COOLDOWN 24h (una vez por día, no spam).
//
// Multi-user: iteramos usuarios.listarActivos(). Cada usuario tiene sus
// propios pendientes, su propio cooldown (en estado_usuario) y su propio
// destino WA (wa_lid || wa_cus).

const mem = require('./memory');
const usuarios = require('./usuarios');

const CONSULTA_UMBRAL_H   = Number(process.env.RECORDATORIO_CONSULTA_UMBRAL_H   || 2);
const CONSULTA_COOLDOWN_H = Number(process.env.RECORDATORIO_CONSULTA_COOLDOWN_H || 3);
const TAREA_UMBRAL_H      = Number(process.env.RECORDATORIO_TAREA_UMBRAL_H     || 24);
const TAREA_COOLDOWN_H    = Number(process.env.RECORDATORIO_TAREA_COOLDOWN_H   || 24);

const KEY_ULT_CONSULTA = 'ultimo_recordatorio_consultas';
const KEY_ULT_TAREA    = 'ultimo_recordatorio_tareas';

const CONFIG = {
  consulta: {
    umbralH:    CONSULTA_UMBRAL_H,
    cooldownH:  CONSULTA_COOLDOWN_H,
    keyGlobal:  KEY_ULT_CONSULTA,
    encabezado: (n) => `Te debo consulta sobre ${n === 1 ? 'algo pendiente' : `${n} cosas pendientes`} 👇`,
    cierre:     'Decime qué hago con cada uno.',
  },
  tarea: {
    umbralH:    TAREA_UMBRAL_H,
    cooldownH:  TAREA_COOLDOWN_H,
    keyGlobal:  KEY_ULT_TAREA,
    encabezado: (n) => `Recordatorio — ${n === 1 ? 'tenés 1 tarea' : `tenés ${n} tareas`} abiertas 📝`,
    cierre:     'Cuando termines alguna decime "listo <nombre>" y la saco.',
  },
};

function _horasDesde(isoTs) {
  if (!isoTs) return Infinity;
  const t = new Date(isoTs).getTime();
  if (isNaN(t)) return Infinity;
  return (Date.now() - t) / 3_600_000;
}

function _destinoWA(usuario) {
  return usuario.wa_lid || usuario.wa_cus || null;
}

function _tipoDe(p) {
  return p.meta?.tipo || 'consulta';
}

function _formatearTexto(tipo, candidatos) {
  const cfg = CONFIG[tipo];
  const lineas = candidatos.map((p, i) => {
    const partes = [p.desc];
    if (tipo === 'consulta' && p.meta?.remitente) partes.push(`de ${p.meta.remitente}`);
    if (p.creado) {
      const h = Math.floor(_horasDesde(p.creado));
      if (h >= 1) partes.push(`${h}h`);
    }
    return `${i + 1}. ${partes.join(' — ')}`;
  });
  return `${cfg.encabezado(candidatos.length)}\n\n${lineas.join('\n')}\n\n${cfg.cierre}`;
}

/**
 * Procesa UN tipo para UN usuario. Devuelve { enviado, cuantos, motivo }.
 */
async function _procesarTipoUsuario(tipo, usuario, pendientes, { waClient }) {
  const cfg = CONFIG[tipo];
  const destino = _destinoWA(usuario);
  if (!destino) return { enviado: false, motivo: 'sin-destino-wa' };

  const ultimoGlobal = mem.getEstadoUsuario(usuario.id, cfg.keyGlobal);
  if (ultimoGlobal && _horasDesde(ultimoGlobal) < cfg.cooldownH) {
    return { enviado: false, motivo: 'cooldown-global' };
  }

  const candidatos = pendientes.filter(p => {
    if (_tipoDe(p) !== tipo) return false;
    const edad = _horasDesde(p.creado);
    if (edad < cfg.umbralH) return false;
    const ultimoPing = p.ultimo_recordatorio || p.meta?.ultimo_recordatorio;
    if (ultimoPing && _horasDesde(ultimoPing) < cfg.cooldownH) return false;
    return true;
  });

  if (!candidatos.length) return { enviado: false, motivo: 'sin-candidatos' };

  const texto = _formatearTexto(tipo, candidatos);

  try {
    await waClient.sendMessage(destino, texto);
  } catch (err) {
    console.error(`[recordatorios/${usuario.nombre}/${tipo}] falló sendMessage:`, err.message);
    mem.log({
      usuarioId: usuario.id,
      canal: 'sistema', direccion: 'interno',
      cuerpo: `recordatorio ${tipo} falló: ${err.message}`,
      metadata: { destino, cuantos: candidatos.length, tipo },
    });
    if (waClient._watchdogFrameMuerto) {
      waClient._watchdogFrameMuerto(err, `recordatorios/${usuario.nombre}/${tipo}`);
    }
    return { enviado: false, motivo: 'error', error: err.message };
  }

  const ahora = new Date().toISOString();
  for (const c of candidatos) {
    mem.marcarRecordatorioPendiente(c.id, ahora);
  }
  mem.setEstadoUsuario(usuario.id, cfg.keyGlobal, ahora);

  mem.log({
    usuarioId: usuario.id,
    canal: 'whatsapp', direccion: 'saliente',
    de: destino, cuerpo: texto,
    metadata: { tipo: 'recordatorio', subtipo: tipo, cuantos: candidatos.length },
  });
  console.log(`[recordatorios/${usuario.nombre}/${tipo}] ping → ${destino} (${candidatos.length})`);

  return { enviado: true, cuantos: candidatos.length };
}

/**
 * Una pasada del loop: para cada usuario activo procesa consulta y tarea.
 */
async function tickOnce({ waClient } = {}) {
  if (!waClient) return { enviado: false, motivo: 'no-waClient' };

  const activos = usuarios.listarActivos();
  const resultados = [];
  for (const u of activos) {
    const pendientes = mem.listarPendientes(u.id);
    if (!pendientes.length) continue;
    const resConsulta = await _procesarTipoUsuario('consulta', u, pendientes, { waClient });
    const resTarea    = await _procesarTipoUsuario('tarea',    u, pendientes, { waClient });
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
