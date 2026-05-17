// memoria-curada.js — job nightly que sintetiza interacciones por (user×contacto).
//
// Para cada usuario activo, para cada contacto con eventos nuevos desde la
// última síntesis, le pedimos a Claude que produzca una nota corta acumulativa
// sobre el contacto desde la perspectiva del usuario. La nota se inyecta al
// prompt en runtime cuando ese contacto aparece en el contexto de la
// conversación (seccionContacto en prompt-builder.js).
//
// Estructura de la síntesis (prosa libre, no estructurada):
//   - Quién es el contacto (rol, contexto)
//   - Qué temas vienen tratando
//   - Preferencias / patrones observados (responde rápido/lento, prefiere email, etc.)
//   - Estado actual de cualquier gestión activa
//
// Filtro: sólo curamos contactos con >= 3 eventos nuevos desde la última nota
// (ahorramos tokens en contactos poco activos).

const mem = require('./memory');
const usuarios = require('./usuarios');
const { invocarClaude } = require('./claude-client');

const MIN_EVENTOS_NUEVOS = 3;

function _formatearEventosParaPrompt(eventos) {
  return eventos.map(e => {
    const flecha = e.direccion === 'entrante' ? '→' : (e.direccion === 'saliente' ? '←' : '·');
    const cuerpo = (e.cuerpo || '').replace(/\s+/g, ' ').slice(0, 350);
    const asunto = e.asunto ? `"${e.asunto}" | ` : '';
    return `[${e.timestamp}] ${flecha} ${e.canal.toUpperCase()} ${asunto}${cuerpo}`;
  }).join('\n');
}

async function _curarUnContacto({ usuario, contacto }) {
  const notaPrevia = mem.getNotaContacto(usuario.id, contacto.id);
  const desdeId = notaPrevia ? notaPrevia.eventos_sintetizados_hasta : 0;
  const eventos = mem.eventosConContactoDesde({
    usuarioId: usuario.id,
    contacto,
    desdeEventId: desdeId,
    max: 200,
  });
  if (eventos.length < MIN_EVENTOS_NUEVOS) return { curado: false, motivo: `solo ${eventos.length} eventos nuevos` };

  const maxId = eventos[eventos.length - 1].id;

  const prompt = `Sos un asistente que cura memoria de largo plazo para una secretaria virtual. Tu tarea es producir una nota breve sobre un contacto desde la perspectiva del usuario al que la secretaria atiende.

USUARIO: ${usuario.nombre}
CONTACTO: ${contacto.nombre}${contacto.whatsapp ? ` (WA: ${contacto.whatsapp})` : ''}${contacto.email ? ` (email: ${contacto.email})` : ''}${contacto.notas ? `\nNotas previas en libreta: ${contacto.notas}` : ''}

${notaPrevia ? `NOTA ACUMULADA (síntesis previa):\n${notaPrevia.nota}\n\n` : ''}INTERACCIONES NUEVAS DESDE LA ÚLTIMA SÍNTESIS (${eventos.length} eventos):
${_formatearEventosParaPrompt(eventos)}

Tu tarea:
Producí una nota actualizada (~300-500 palabras máximo, prosa fluida en español rioplatense, primera persona desde la perspectiva de ${usuario.nombre}) que cubra:
  - Quién es ${contacto.nombre} para ${usuario.nombre} (rol, contexto de la relación).
  - Qué temas/gestiones vienen tratando.
  - Preferencias o patrones observados (responde rápido/lento, prefiere email vs WA, horarios, tono).
  - Estado actual de gestiones activas, si las hay.
  - Cosas a tener en cuenta para futuras interacciones.

Si ya hay NOTA ACUMULADA, integrala con las interacciones nuevas — no la reemplaces, refinala. Si las interacciones nuevas contradicen lo viejo, prevalece lo nuevo.

Devolvé SOLO el texto de la nota actualizada. Sin meta-comentarios, sin "aquí está la nota:", sin markdown. Empezá directamente con el contenido.`;

  let nota;
  try {
    nota = await invocarClaude(prompt, {
      timeoutMs: 120_000,
      audit: { usuarioId: usuario.id, canal: 'memoria-curada' },
    });
    nota = String(nota).trim();
    if (!nota) throw new Error('Claude devolvió vacío');
    if (nota.length > 4000) nota = nota.slice(0, 4000);
  } catch (err) {
    console.warn(`[memoria-curada/${usuario.nombre}×${contacto.nombre}] Claude falló: ${err.message}`);
    return { curado: false, motivo: `Claude falló: ${err.message}` };
  }

  mem.upsertNotaContacto({
    usuarioId: usuario.id,
    contactoId: contacto.id,
    nota,
    hasta: maxId,
  });
  console.log(`[memoria-curada] ${usuario.nombre} × ${contacto.nombre}: nota actualizada (${eventos.length} eventos nuevos, ${nota.length} chars)`);
  return { curado: true, eventos: eventos.length, hasta: maxId };
}

async function tick() {
  const activos = usuarios.listarActivos();
  let totalCurados = 0;
  let totalEvaluados = 0;
  for (const u of activos) {
    // Contactos visibles para este usuario (priv + públicos).
    const contactos = mem.todosLosContactos ? mem.todosLosContactos(u.id) : [];
    for (const c of contactos) {
      totalEvaluados++;
      try {
        const r = await _curarUnContacto({ usuario: u, contacto: c });
        if (r.curado) totalCurados++;
      } catch (err) {
        console.error(`[memoria-curada/${u.nombre}×${c.nombre}] tick error: ${err.message}`);
      }
    }
  }
  if (totalCurados > 0) {
    console.log(`[memoria-curada] tick: ${totalCurados}/${totalEvaluados} contactos curados`);
  }
}

function iniciarMemoriaCurada({ intervaloMs = 24 * 60 * 60_000 } = {}) {
  const horas = (intervaloMs / 3600 / 1000).toFixed(1);
  console.log(`[memoria-curada] activo, cada ${horas}h (min ${MIN_EVENTOS_NUEVOS} eventos nuevos para curar)`);
  // El primer tick lo programamos para 30s después del boot — no queremos
  // sobrecargar el boot con muchas llamadas a Claude. Si la instancia recién
  // arranca después de un downtime largo, el catch-up se hace ahí.
  setTimeout(() => {
    tick().catch(err => console.error('[memoria-curada] tick inicial:', err.message));
  }, 30_000);
  return setInterval(() => {
    tick().catch(err => console.error('[memoria-curada] tick:', err.message));
  }, intervaloMs);
}

module.exports = { iniciarMemoriaCurada, tick };
