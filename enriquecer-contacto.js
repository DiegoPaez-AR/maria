// enriquecer-contacto.js — al crear un contacto (o en un backfill), busca en la
// web su rol/empresa (a partir del nombre + empresa del dominio del email) y lo
// guarda en contactos.perfil_web. El meeting-prep y el prompt lo leen de ahí.
// LinkedIn no se puede consultar por email; es búsqueda web best-effort. Si no
// hay datos confiables, no escribe nada.

const { invocarClaude } = require('./claude-client');
const mem = require('./memory');

const _DOMINIOS_GENERICOS = new Set([
  'gmail.com','googlemail.com','hotmail.com','hotmail.com.ar','outlook.com','outlook.com.ar',
  'yahoo.com','yahoo.com.ar','icloud.com','me.com','live.com','proton.me','protonmail.com','aol.com',
]);

function _empresaDesdeEmail(email) {
  const dom = (String(email || '').split('@')[1] || '').toLowerCase();
  if (!dom || _DOMINIOS_GENERICOS.has(dom)) return null;
  return dom;
}

// ¿Vale la pena buscar a este contacto en la web? (10/10/2026, revisión 30d:
// enriquecer-contacto era el 23% del gasto de Maria y el 42% del de Sofia).
//   - NO si es un "stub": el nombre es el local-part del email ("Adrianecker",
//     "Nbruscoli") — los crea meeting-prep; buscar eso en la web no da nada
//     (104 de 130 stubs de la libreta de Diego habían sido buscados).
//   - NO si ya tiene perfil_web (cada re-upsert volvía a buscar).
//   - NO sin email o con nombre de una sola palabra sin dominio de empresa.
function conviene(c) {
  if (!c || !c.email || !c.nombre) return false;
  const local = String(c.email).split('@')[0].toLowerCase().replace(/[._\-+\d]/g, '');
  const nom = String(c.nombre).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\s._\-]/g, '');
  if (local && nom === local) return false;                       // stub
  if (!/\s/.test(String(c.nombre).trim()) && !_empresaDesdeEmail(c.email)) return false; // "Juan" @gmail
  if (c.perfil_web) return false;                                 // ya lo tenemos; se renueva a mano (backfill-perfiles.js)
  return true;
}

// Enriquece UN contacto. usuarioId + objeto { id, nombre, email }. Devuelve el
// perfil guardado (string) o null. No tira: loguea y sigue.
async function enriquecerContacto(usuarioId, contacto) {
  if (!contacto || !contacto.id || !contacto.nombre || !contacto.email) return null;
  const empresa = _empresaDesdeEmail(contacto.email);
  const prompt = `Buscá en la web quién es esta persona, para dar contexto profesional antes de una reunión.
Persona: ${contacto.nombre}${empresa ? ` (empresa probable según su email: ${empresa})` : ''}
Email: ${contacto.email}

Devolvé UNA sola línea corta (máx ~110 caracteres) con su ROL/CARGO y EMPRESA actuales si los encontrás con confianza razonable (ej: "Director Comercial en Acme" o "Founder & CEO, Acme"). Si no encontrás info confiable de ESTA persona, devolvé EXACTAMENTE: sin datos
No inventes ni completes con suposiciones. NO incluyas fuentes, links, URLs, markdown ni la palabra "Sources": SOLO la línea del rol/empresa (o exactamente "sin datos"). Si no estás 100% seguro, devolvé "sin datos".`;
  try {
    let r = await invocarClaude(prompt, { timeoutMs: 70_000, audit: { usuarioId, canal: 'enriquecer-contacto' },
      extraArgs: ['--model', process.env.MARIA_ENRIQUECER_MODEL || 'haiku'] });
    r = String(r || '').replace(/\s+/g, ' ').trim();
    if (!r || /^sin datos\.?$/i.test(r)) return null;
    const perfil = r.slice(0, 160);
    mem.setPerfilWebContacto(usuarioId, contacto.id, perfil);
    return perfil;
  } catch (err) {
    console.warn(`[enriquecer-contacto] ${contacto.email} falló: ${err.message}`);
    return null;
  }
}

module.exports = { enriquecerContacto, conviene, _empresaDesdeEmail };
