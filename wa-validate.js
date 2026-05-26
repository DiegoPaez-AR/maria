// wa-validate.js
// Helper centralizado para validar números de WhatsApp antes de persistirlos.
//
// PROBLEMA QUE RESUELVE
// ─────────────────────
// Cuando el LLM arma un wa_cus (`<digitos>@c.us`) interpretando un número
// dictado en lenguaje natural, puede:
//   - asumir prefijo Argentina (54) cuando el número es de otro país,
//   - omitir dígitos, agregar dígitos extra,
//   - construir un wid que no corresponde a ningún user en WhatsApp.
//
// Caso real (2026-05-10): contacto "Enrique Sosa" guardado con
// `54959899643028@c.us` (mal — Enrique tiene país UY, +598). Cuando una
// semana después se promovió a usuario, intentar enviar bienvenida explotó
// con "No LID for user".
//
// CÓMO VALIDA
// ───────────
// Llama `client.getNumberId(digitos)` (WhatsApp Web hace lookup contra los
// servers de WA) y devuelve el `_serialized` real (puede ser `@c.us` o
// `@lid`). Si WA no encuentra al user, lanza error con mensaje claro que
// incluye códigos de país comunes — el LLM lo ve y le pregunta al owner.
//
// CASOS ESPECIALES
// ────────────────
// - input `@lid`: ya válido (lo capturó el runtime), se devuelve tal cual.
// - input vacío/null: se devuelve null (caller decide qué hacer).
// - sin client (e.g. ejecutado desde gmail-handler sin sesión WA): error
//   explícito — no permitimos guardar wa sin verificar.

// Dado un wid `<digitos>@lid`, intenta conseguir el `<digitos>@c.us` del mismo
// contacto via Contact.id._serialized. WA Web mantiene este mapping cuando el
// contacto está en cache. Si no se puede, devuelve null y el caller decide.
async function _lidAcUs(lid, client) {
  if (!client) return null;
  try {
    const c = await client.getContactById(lid);
    const ser = c && c.id && c.id._serialized;
    if (ser && /@c\.us$/.test(ser)) return ser;
    return null;
  } catch {
    return null;
  }
}

async function normalizarWaCus(input, client) {
  if (input == null) return null;
  if (typeof input !== 'string') {
    throw new Error(`validar_wa: input no es string (${typeof input})`);
  }
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Si ya es un @lid bien formado, intentar resolver a @c.us (más estable).
  // Si no se puede, devolver el @lid igual — el runtime ya lo capturó del
  // msg.from cuando el usuario escribió desde un dispositivo vinculado.
  if (/^\d+@lid$/.test(trimmed)) {
    const cus = await _lidAcUs(trimmed, client);
    return cus || trimmed;
  }

  if (!client) {
    throw new Error(
      `validar_wa: no tengo cliente de WhatsApp disponible para verificar "${input}". ` +
      `Cargá el contacto desde una conversación de WhatsApp o pedile al owner que escriba primero.`
    );
  }

  // Extraer solo dígitos. Acepta "+598 95 989 9643", "598959899643@c.us",
  // "598 959-899-643", etc.
  const digitos = trimmed.replace(/[^\d]/g, '');
  if (!digitos) {
    throw new Error(`validar_wa: "${input}" no contiene dígitos`);
  }

  // Probar el número tal cual, y si no encuentra, probar fallback AR
  // (con/sin "9" móvil — Argentina tiene el quirk de que algunos móviles se
  // registran en WhatsApp con "9" tras el +54 y otros sin). Ej: +54 9 11 ...
  // vs +54 11 ... pueden ser el mismo número desde el punto de vista de WA.
  const candidatos = [digitos];
  if (/^54\d{10}$/.test(digitos)) {
    // 54 + 10 dígitos (sin "9") → probar también con "9"
    candidatos.push('549' + digitos.slice(2));
  } else if (/^549\d{10}$/.test(digitos)) {
    // 549 + 10 dígitos → probar también sin el "9"
    candidatos.push('54' + digitos.slice(3));
  }

  let wid = null;
  let lastErr = null;
  for (const cand of candidatos) {
    try {
      const r = await client.getNumberId(cand);
      if (r && r._serialized) {
        wid = r;
        break;
      }
    } catch (err) {
      lastErr = err;
    }
  }

  // Si el lookup devolvió un @lid, intentar resolver a @c.us. Es más estable
  // y el sanitizer downstream en memory.upsertContacto descarta @lid.
  if (wid && wid._serialized && /@lid$/.test(wid._serialized)) {
    const cus = await _lidAcUs(wid._serialized, client);
    if (cus) {
      return cus;
    }
    throw new Error(
      `validar_wa: ${digitos} resuelve al LID ${wid._serialized} y no se pudo obtener el c.us correspondiente. ` +
      `Posible WA Business o cuenta legacy sin mapping estable. Pedile al owner que envíe la vCard del contacto.`
    );
  }

  if (!wid || !wid._serialized) {
    if (lastErr) {
      throw new Error(
        `validar_wa: WhatsApp respondió error consultando ${digitos}: ${lastErr.message}. ` +
        `Reintentá en un minuto o verificá el número con el owner.`
      );
    }
    throw new Error(
      `validar_wa: el número "${digitos}" no aparece en WhatsApp${candidatos.length > 1 ? ` (probé también ${candidatos.slice(1).join(', ')})` : ''}. ` +
      `IMPORTANTE: pedile al owner que te envíe la TARJETA DE CONTACTO (vCard) de la persona — eso garantiza que WhatsApp ` +
      `resuelva al user con el LID correcto. Dictado por chat ("+54 9 11 1234-5678") puede no funcionar si esa persona ` +
      `no está en cache de WhatsApp todavía. Si insiste, verificá el código de país: ` +
      `Argentina=+54 (con o sin "9" móvil), Uruguay=+598, Paraguay=+595, Brasil=+55, Chile=+56, España=+34, México=+52, EEUU=+1.`
    );
  }

  return wid._serialized;
}

module.exports = { normalizarWaCus };
