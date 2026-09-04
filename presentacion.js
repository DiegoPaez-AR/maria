// presentacion.js — alta automática de terceros que SE PRESENTAN para un usuario
// (2026-09-04, diseño Diego). Caso disparador: Maria (asistente de Diego) le
// escribe a Sofia por WhatsApp "hola, soy Maria, secretaria de Diego Paez,
// quiero coordinar una reunión con Noelia" → número desconocido → el guard
// de identidad la descartaba y le avisaba a Noelia. Ahora: un clasificador
// barato (Haiku) mira el PRIMER mensaje de un desconocido; si se presenta y
// nombra a un usuario de la instancia, se lo da de alta en la libreta de ese
// usuario (→ Google Contacts → teléfono, por la réplica de siempre) y el
// mensaje sigue al flujo normal de terceros. El usuario recibe una línea de
// aviso. Si no nombra a nadie, o no matchea, queda como antes (descarte con
// aviso por WA; pregunta "¿para quién?" por mail).
//
// Frenos:
//   - nunca da de alta a alguien que ya es usuario de la instancia (número/email)
//   - tope diario de altas automáticas (MARIA_ALTA_AUTO_MAX, default 5)
//   - killswitch MARIA_ALTA_AUTO=0
//   - el clasificador corre SIN tools (usuarioId null) — texto de un desconocido
//     = prompt injection potencial, igual criterio que gestion-ajena.

const mem = require('./memory');
const usuarios = require('./usuarios');
const tel = require('./telefonos');
const { invocarClaudeJSON } = require('./claude-client');

const ASISTENTE_NOMBRE = process.env.ASISTENTE_NOMBRE || 'Maria';
const MARCA = '[alta automática';

function habilitado() { return process.env.MARIA_ALTA_AUTO !== '0'; }

function _altasHoy() {
  try {
    return mem.db.prepare(
      `SELECT COUNT(*) AS n FROM contactos WHERE notas LIKE ? AND date(creado) = date('now')`
    ).get(`%${MARCA}%`).n;
  } catch { return 0; }
}

function _esUsuario({ digs, email }) {
  const activos = usuarios.listarActivos();
  if (digs) {
    for (const u of activos) {
      const d = tel.digitos(u.wa_cus || '');
      if (d && tel.mismoNumero(d, digs)) return true;
    }
  }
  if (email) {
    const e = String(email).trim().toLowerCase();
    if (activos.some(u => String(u.email || '').trim().toLowerCase() === e)) return true;
  }
  return false;
}

function _norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}

async function clasificar({ canal, identificador, nombreVisible, cuerpo, asunto }) {
  const activos = usuarios.listarActivos().filter(u => u.servido !== 0);
  if (!activos.length) return null;
  const lista = activos.map(u => `  - id=${u.id}, nombre="${u.nombre}"`).join('\n');
  const prompt = `Sos un clasificador. ${ASISTENTE_NOMBRE} es una asistente que atiende a estas personas (sus usuarios):
${lista}

Alguien DESCONOCIDO le escribió por ${canal}${identificador ? ` desde ${identificador}` : ''}${nombreVisible ? ` (se muestra como "${nombreVisible}")` : ''}${asunto ? `, asunto: "${asunto}"` : ''}:
"""
${String(cuerpo || '').slice(0, 900)}
"""

¿El remitente SE PRESENTA (dice quién es: nombre, o nombre + rol/empresa/"asistente de X") Y deja claro que busca a UNO de los usuarios de la lista, nombrándolo?
Reglas:
- "para_usuario" tiene que ser el id de un usuario NOMBRADO en el mensaje (nombre o apellido). Si el mensaje no nombra a ninguno, o nombra a alguien que no está en la lista: null.
- Si no dice quién es (solo "hola", una pregunta suelta, un link, publicidad, spam): presentacion=false.
- "nombre" es como se presentó, con rol si lo dijo, máx 60 caracteres (ej: "Maria (asistente de Diego Paez)", "Carla de Seguros La Caja").
- "tema": en 8 palabras qué quiere, o null.
Respondé SOLO este JSON, sin nada más:
{"presentacion": true|false, "nombre": <string|null>, "para_usuario": <int|null>, "tema": <string|null>}
Ante la MÍNIMA duda: {"presentacion": false, "nombre": null, "para_usuario": null, "tema": null}`;

  const { json } = await invocarClaudeJSON(prompt, {
    timeoutMs: 25000,
    extraArgs: ['--model', process.env.MARIA_MOD_MODEL || 'haiku'],
    audit: { usuarioId: null, canal: `${canal}-presentacion` },
  });
  if (!json || json.presentacion !== true || !json.nombre || !json.para_usuario) return null;
  const u = activos.find(x => x.id === Number(json.para_usuario));
  if (!u) return null;
  // Doble check barato: el usuario elegido tiene que estar NOMBRADO en el texto
  // (nombre o apellido, ≥3 letras). Un clasificador que "adivina" no alcanza.
  const partes = _norm(u.nombre).split(' ').filter(p => p.length >= 3);
  const txt = _norm(cuerpo) + ' ' + _norm(asunto);
  if (!partes.some(p => txt.includes(p))) return null;
  return { usuario: u, nombre: String(json.nombre).slice(0, 60), tema: json.tema ? String(json.tema).slice(0, 80) : null };
}

/**
 * Intenta dar de alta al remitente desconocido como contacto del usuario que
 * nombra. Devuelve { usuario, contacto, nombre, tema } o null.
 *   canal: 'whatsapp' | 'gmail'
 *   digs:  dígitos del número (WA) · email: remitente (gmail)
 */
async function altaAutomatica({ canal, digs = null, email = null, nombreVisible = null, cuerpo, asunto = null }) {
  if (!habilitado()) return null;
  if (!digs && !email) return null;
  if (_esUsuario({ digs, email })) return null;
  const max = Number(process.env.MARIA_ALTA_AUTO_MAX || 5);
  if (_altasHoy() >= max) {
    console.warn(`[presentacion] tope diario de altas automáticas (${max}) alcanzado — no doy de alta`);
    return null;
  }
  let r = null;
  try {
    r = await clasificar({ canal, identificador: digs ? `+${digs}` : email, nombreVisible, cuerpo, asunto });
  } catch (err) {
    console.warn(`[presentacion] clasificador falló: ${err.message}`);
    return null;
  }
  if (!r) return null;
  const { usuario, nombre, tema } = r;
  const hoy = new Date().toLocaleDateString('es-AR', { timeZone: usuario.tz || 'America/Argentina/Buenos_Aires', day: 'numeric', month: 'numeric' });
  const notas = `${MARCA} ${hoy}] se presentó por ${canal === 'gmail' ? 'mail' : 'WhatsApp'}${tema ? `: ${tema}` : ''}`;
  let contacto;
  try {
    contacto = mem.upsertContacto({
      usuarioId: usuario.id,
      nombre,
      whatsapp: digs ? (tel.clave(digs) || digs) : null,
      email: email || null,
      notas,
      visibilidad: 'privada',
    });
  } catch (err) {
    console.warn(`[presentacion] upsertContacto falló: ${err.message}`);
    return null;
  }
  if (!contacto || !contacto.id) return null;

  mem.log({ usuarioId: usuario.id, canal: 'sistema', direccion: 'interno',
    cuerpo: `presentacion: "${nombre}" (${digs ? '+' + digs : email}) se presentó por ${canal} para ${usuario.nombre} → alta automática en su libreta (#${contacto.id})${tema ? ` · ${tema}` : ''}`,
    metadata: { tipo: 'alta_automatica_tercero', canal, contacto_id: contacto.id, tema } });
  console.log(`[presentacion] "${nombre}" → contacto #${contacto.id} de ${usuario.nombre} (${canal})`);

  // Réplica a Google Contacts → teléfono. Fire-and-forget.
  try {
    require('./google-contacts').sincronizarContacto(contacto, { dueno: usuario.nombre })
      .then(x => console.log(`[gcontacts] "${contacto.nombre}" ${x.creado ? 'creado' : 'actualizado'} en Google Contacts (presentacion)`))
      .catch(err => console.warn('[gcontacts] sync (presentacion) falló:', err.message));
  } catch { /* noop */ }

  // Una línea al usuario, por su canal (TG > email). Best-effort.
  try {
    await require('./wa-send').enviarWAUsuario(null, usuario,
      `📇 Di de alta a *${nombre}* como contacto tuyo: me escribió por ${canal === 'gmail' ? 'mail' : 'WhatsApp'}${tema ? ` para ${tema}` : ''}. Si no corresponde, decime y lo saco.`,
      { tag: 'presentacion/alta', metadata: { tipo: 'alta_automatica_aviso', contacto_id: contacto.id } });
  } catch (err) { console.warn(`[presentacion] no pude avisar a ${usuario.nombre}: ${err.message}`); }

  return { usuario, contacto, nombre, tema };
}

module.exports = { altaAutomatica, clasificar, habilitado };
