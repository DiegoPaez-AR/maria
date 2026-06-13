// moderacion.js — gate de contenido inapropiado (2026-06-13).
//
// Clasifica texto que Maria está por ENVIAR a un tercero (outbound, siempre)
// o que RECIBE de un tercero (inbound, con pre-filtro barato). Categorías:
// sexual, amenaza/violencia, acoso/coacción, armas/explosivos/ilícito, otro
// delictivo. NO bloquea tono comercial firme legítimo (cobranzas, reclamos).
//
// Defensa en profundidad: esto es la capa de CÓDIGO (no se esquiva con
// prompting). La capa de prompt (regla en [SEGURIDAD]) es la primera línea.
//
// Killswitch: MARIA_MODERACION=0 lo apaga. Modelo: MARIA_MOD_MODEL (default
// 'haiku' — barato y rápido para clasificar).

const { invocarClaudeJSON } = require('./claude-client');

const _on     = () => process.env.MARIA_MODERACION !== '0';
const _modelo = () => process.env.MARIA_MOD_MODEL || 'haiku';

const CATS = ['sexual', 'amenaza_violencia', 'acoso_coaccion', 'armas_explosivos_ilicito', 'otro_delictivo'];

// Pre-filtro INBOUND: un keyword NO condena (no bloquea por sí solo), solo
// decide si vale la pena gastar una clasificación en un mensaje entrante.
// El outbound NO usa esto: clasifica siempre (camino crítico legal).
const RE_SOSPECHA = /(sex[ou]|porno?|desnud|pija|concha|verga|coger|cojer|viola(r|te|lo|da)|te (voy|van) a (matar|cagar a|romper)|matar(te|lo|los)?|amenaz|bomba|explosiv|\bc4\b|detonad|p[oó]lvora|arma de fuego|pistola|fusil|granad|secuestr|extorsi[oó]n|chantaj|drog|coca[ií]n|\bmerca\b|abus(ar|o sexual)|acos(ar|o))/i;

function _heuristicaInbound(texto) {
  return RE_SOSPECHA.test(String(texto || ''));
}

const SYSTEM_CLASIF = `Sos un clasificador de moderación de contenido para una asistente virtual que envía y recibe mensajes (WhatsApp y email) en un contexto profesional y personal cotidiano. Recibís UN texto y devolvés JSON.

Marcá "bloquear": true SOLO si el texto cae claramente en alguna de estas categorías DAÑINAS:
- sexual: contenido sexual explícito, propuestas o insinuaciones sexuales, acoso sexual.
- amenaza_violencia: amenazas de daño físico a personas, incitación a la violencia.
- acoso_coaccion: hostigamiento dirigido, extorsión, coacción, chantaje.
- armas_explosivos_ilicito: instrucciones para fabricar armas, explosivos o bombas, o para cometer un delito.
- otro_delictivo: cualquier otra cosa claramente delictiva.

NO es violación (bloquear:false):
- Tono comercial firme y legítimo: cobranzas ("si no abonás paso el tema a legales"), reclamos, intimaciones, follow-ups insistentes.
- Lenguaje directo, seco o enojado SIN amenaza de daño físico ni hostigamiento.
- Puteadas leves de la cotidianeidad rioplatense sin destinatario hostigado.
Ante la duda entre "firme/grosero" y "dañino", elegí false. Preferí dejar pasar antes que bloquear un mensaje legítimo.

Respondé SOLO con JSON válido, sin markdown:
{"bloquear": true|false, "categoria": "<una de: ${CATS.join(', ')}, o null>", "severidad": "ninguna"|"leve"|"alta", "motivo": "<máx 12 palabras>"}`;

/**
 * Clasifica un texto. Devuelve { ok, bloquear, categoria, severidad, motivo }.
 * FAIL-OPEN: si el clasificador falla (timeout, JSON roto), devuelve ok:true
 * con _incierto/_error — no rompemos el flujo de Maria por un fallo del juez.
 * La capa de prompt ya filtró lo peor; el gate es defensa adicional, no única.
 */
async function clasificar(texto, { direccion = 'saliente' } = {}) {
  const t = String(texto || '').trim();
  if (!t) return { ok: true, bloquear: false, categoria: null, severidad: 'ninguna' };
  try {
    const { json } = await invocarClaudeJSON(
      { system: SYSTEM_CLASIF, user: `[dirección: ${direccion}]\n"""\n${t.slice(0, 1500)}\n"""` },
      {
        timeoutMs: 30000, idleTimeoutMs: 20000,
        extraArgs: ['--model', _modelo()],
        audit: { usuarioId: null, canal: 'moderacion' },
      }
    );
    if (!json || typeof json.bloquear === 'undefined') {
      return { ok: true, bloquear: false, categoria: null, severidad: 'ninguna', _incierto: true };
    }
    const bloquear = !!json.bloquear;
    return {
      ok: !bloquear,
      bloquear,
      categoria: json.categoria && CATS.includes(json.categoria) ? json.categoria : (bloquear ? 'otro_delictivo' : null),
      severidad: json.severidad || (bloquear ? 'alta' : 'ninguna'),
      motivo: json.motivo || null,
    };
  } catch (err) {
    console.warn('[moderacion] clasificador falló (fail-open):', err.message);
    return { ok: true, bloquear: false, categoria: null, severidad: 'ninguna', _error: err.message };
  }
}

/** Outbound: clasifica SIEMPRE (camino crítico). */
async function revisarSaliente(texto) {
  if (!_on()) return { ok: true, bloquear: false };
  return clasificar(texto, { direccion: 'saliente' });
}

/** Inbound: pre-filtro keywords; solo clasifica los sospechosos. */
async function revisarEntrante(texto) {
  if (!_on()) return { ok: true, bloquear: false };
  if (!_heuristicaInbound(texto)) return { ok: true, bloquear: false, categoria: null, severidad: 'ninguna' };
  return clasificar(texto, { direccion: 'entrante' });
}

module.exports = { revisarSaliente, revisarEntrante, clasificar, _heuristicaInbound, CATS };
