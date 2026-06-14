// maria-worker.js — ejecuta los pendientes PROPIOS de Maria (dueno='maria',
// disparador='manual'). Antes de este loop, esas tareas no las ejecutaba
// nadie: no pingan al usuario y ningún proceso las levantaba, así que vivían
// abiertas para siempre (caso Cristian Ruiz, pendiente 118 del 02/06).
//
// Diseño:
//   - Tick cada MARIA_WORKER_MS (default 30 min). UNA ejecución real por tick
//     (cap de costo: cada ejecución es un claude_call completo).
//   - Ventana horaria 08-22 en la tz del usuario dueño de la tarea (no mandar
//     research por email a las 3 AM).
//   - Cooldown por tarea: tras un intento (exitoso o no) no se reintenta por
//     MARIA_WORKER_COOLDOWN_H (default 24h). Usamos pendientes.ultimo_recordatorio
//     como timestamp de último intento (los dueno=maria no usan recordatorios,
//     la columna está libre en esa familia).
//   - Tope de intentos: tras 3 intentos sin que la tarea se cierre, se avisa
//     al usuario dueño por WA y se deja de intentar (meta.worker_pausado=1).
//     El pendiente queda abierto para que lo cierren o reformulen a mano.
//   - La ejecución reusa el pipeline normal: construirPrompt del usuario dueño
//     + entrada sintética que le ordena ejecutar la tarea, claude_call con
//     consultas habilitadas, respuesta_a_usuario via WA, acciones via executor.
//     Si el LLM completa la tarea, él mismo emite quitar_pendiente.

const mem = require('./memory');
const usuarios = require('./usuarios');
const waSend = require('./wa-send');
const { construirPrompt } = require('./prompt-builder');
const { invocarClaudeJSONConConsultas } = require('./claude-client');
const { ejecutarAcciones } = require('./executor');

const COOLDOWN_H   = Number(process.env.MARIA_WORKER_COOLDOWN_H || 24);
const MAX_INTENTOS = Number(process.env.MARIA_WORKER_MAX_INTENTOS || 3);
const HORA_DESDE   = Number(process.env.MARIA_WORKER_HORA_DESDE || 8);
const HORA_HASTA   = Number(process.env.MARIA_WORKER_HORA_HASTA || 22);

let _enCurso = false;

function _horaEnTz(tz) {
  try {
    return Number(new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit', hour12: false, timeZone: tz || 'America/Argentina/Buenos_Aires',
    }).format(new Date()));
  } catch { return new Date().getHours(); }
}

// timestamp "YYYY-MM-DD HH:MM:SS" (UTC, sqlite) o ISO → horas desde entonces
function _horasDesde(tsLike) {
  if (!tsLike) return Infinity;
  let s = String(tsLike).trim();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(s)) s = s.replace(' ', 'T') + 'Z';
  else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s) && !/[Zz]|[+-]\d{2}:?\d{2}$/.test(s)) s = s + 'Z';
  const t = new Date(s).getTime();
  if (isNaN(t)) return Infinity;
  return (Date.now() - t) / 3_600_000;
}

function _armarEntrada(usuario, p) {
  const cuerpo = [
    `[TAREA AUTOMÁTICA DEL SISTEMA — esto NO es un mensaje escrito por ${usuario.nombre}]`,
    ``,
    `Ejecutá AHORA tu tarea pendiente id=${p.id}: "${p.desc}"`,
    ``,
    `Reglas para este turno:`,
    `- Es una de tus TAREAS PROPIAS (dueno=maria): la ejecutás vos, sin pedir permiso ni confirmar.`,
    `- Usá tus herramientas (WebSearch/WebFetch para research) y tus acciones (enviar_email, enviar_wa, crear_evento, programar_mensaje, etc.) según lo que pida la tarea.`,
    `- Si la completás: emití quitar_pendiente con id=${p.id} y, si el resultado le importa a ${usuario.nombre}, avisale por respuesta_a_usuario (concreto, sin burocracia).`,
    `- Si la tarea ya fue hecha o ya no tiene sentido (verificalo en [HISTORIAL]/[AGENDA]): emití quitar_pendiente igual, sin avisar.`,
    `- Si NO la podés completar porque falta una decisión o un dato de ${usuario.nombre}: pedíselo por respuesta_a_usuario y dejá el pendiente abierto.`,
    `- NO inventes resultados. Si la research da poco, entregá lo que encontraste de verdad y aclaralo.`,
  ].join('\n');
  return {
    de: usuario.wa_lid || usuario.wa_cus || null,
    nombre: usuario.nombre,
    cuerpo,
    messageId: `maria-worker-${p.id}-${Date.now()}`,
  };
}

// Devuelve true si efectivamente invocó al LLM (gastó un slot del tick).
async function procesarUno(waClient, p) {
  const usuario = usuarios.obtener(p.usuario_id);
  if (!usuario || usuario.activo === 0) return false;
  if (usuario.servido === 0) return false; // owner/operador solo-admin: no proactivamos

  const meta = p.meta || {};
  if (meta.worker_pausado) return false;
  const intentos = meta.worker_intentos || 0;
  if (intentos >= MAX_INTENTOS) return false;

  const h = _horaEnTz(usuario.tz);
  if (h < HORA_DESDE || h >= HORA_HASTA) return false;

  if (_horasDesde(p.ultimo_recordatorio) < COOLDOWN_H) return false;

  // Claim: marcar intento ANTES del call (si el proceso muere a mitad, el
  // cooldown evita martillar la misma tarea en cada arranque).
  mem.marcarRecordatorioPendiente(p.id);
  mem.actualizarMetaPendiente(p.id, { worker_intentos: intentos + 1, worker_ultimo: new Date().toISOString() });

  console.log(`[maria-worker] ejecutando pendiente ${p.id} (${usuario.nombre}, intento ${intentos + 1}/${MAX_INTENTOS}): ${String(p.desc).slice(0, 100)}`);

  let json = null;
  try {
    const entrada = _armarEntrada(usuario, p);
    const prompt = await construirPrompt({ usuario, canal: 'whatsapp', entrada });
    const r = await invocarClaudeJSONConConsultas(prompt, { usuario }, {
      audit: { usuarioId: usuario.id, canal: 'maria-worker' },
    });
    json = r.json;
  } catch (err) {
    console.error(`[maria-worker] pendiente ${p.id}: claude falló: ${err.message}`);
    mem.log({
      usuarioId: usuario.id, canal: 'sistema', direccion: 'interno',
      cuerpo: `maria-worker: pendiente ${p.id} intento ${intentos + 1} falló: ${err.message}`,
      metadata: { tipo: 'maria_worker', pendienteId: p.id, error: err.message },
    });
    await _avisarSiAgotado(waClient, usuario, p, intentos + 1);
    return true;
  }

  // Respuesta al usuario dueño (si la hay)
  const respUsr = (json?.respuesta_a_usuario || '').toString().trim();
  const destino = usuario.wa_lid || usuario.wa_cus || null;
  if (respUsr && destino && waClient) {
    try {
      await waSend.enviarWADirecto(waClient, destino, respUsr, {
        tag: `maria-worker/${p.id}`, logSaliente: true, usuarioId: usuario.id,
      });
    } catch (err) {
      console.error(`[maria-worker] pendiente ${p.id}: enviar respuesta falló: ${err.message}`);
    }
  }

  // Acciones (incluido el quitar_pendiente si la completó)
  const acciones = Array.isArray(json?.acciones) ? json.acciones : [];
  if (acciones.length) {
    const resultados = await ejecutarAcciones(acciones, {
      usuario, waClient, canalOrigen: 'whatsapp',
    });
    const ok = resultados.filter(r => r.ok).length;
    console.log(`[maria-worker] pendiente ${p.id}: ${ok}/${resultados.length} acciones ejecutadas`);
  }

  await _avisarSiAgotado(waClient, usuario, p, intentos + 1);
  return true;
}

// Si agotó los intentos y la tarea sigue abierta → avisar UNA vez y pausar.
async function _avisarSiAgotado(waClient, usuario, p, intentosHechos) {
  if (intentosHechos < MAX_INTENTOS) return;
  let actual = null;
  try { actual = mem.obtenerPendiente(p.id); } catch { return; }
  if (!actual || actual.estado !== 'abierto') return; // la cerró: todo bien
  mem.actualizarMetaPendiente(p.id, { worker_pausado: 1 });
  const destino = usuario.wa_lid || usuario.wa_cus || null;
  if (destino && waClient) {
    try {
      await waSend.enviarWADirecto(
        waClient, destino,
        `Intenté ${MAX_INTENTOS} veces completar esto que tenía anotado y no lo logré cerrar: "${String(p.desc).slice(0, 180)}". Lo dejo en pausa — si querés que lo retome, reformulámelo o decime qué me falta.`,
        { tag: `maria-worker/${p.id}/agotado`, logSaliente: true, usuarioId: usuario.id },
      );
    } catch (err) {
      console.error(`[maria-worker] aviso de agotado falló (pendiente ${p.id}): ${err.message}`);
    }
  }
}

async function tick(waClient) {
  if (_enCurso) return;
  _enCurso = true;
  try {
    const tareas = mem.pendientesMariaManual();
    for (const p of tareas) {
      const ejecuto = await procesarUno(waClient, p);
      if (ejecuto) break; // máx UNA ejecución real por tick (cap de costo)
    }
  } catch (err) {
    console.error('[maria-worker] tick:', err.message);
  } finally {
    _enCurso = false;
  }
}

function iniciarMariaWorker({ waClient, intervaloMs = 30 * 60_000 } = {}) {
  // Primer tick a los 2 min del boot (no competir con el arranque)
  setTimeout(() => { tick(waClient).catch(() => {}); }, 2 * 60_000).unref();
  return setInterval(() => { tick(waClient).catch(() => {}); }, intervaloMs);
}

module.exports = { iniciarMariaWorker, tick };
