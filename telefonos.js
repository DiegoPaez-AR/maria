// telefonos.js — normalización canónica de números de teléfono.
//
// POR QUÉ EXISTE (2026-08-23, explicación de Diego tras el fallo con Manuel
// Carrasco): había ONCE archivos con su propia versión del "9 móvil argentino",
// cada uno con su dialecto (`'549' + d.slice(2)`, `d.startsWith('549')`,
// `d.slice(-10)`…). Cada tanto uno de esos dialectos no matcheaba y se perdía
// un mensaje: el número servido normalizado a 549… no encontraba al contacto
// guardado como 54…, el nombre salía vacío y el envío abortaba.
//
// LA REGLA REAL DE ARGENTINA (no es heurística, es determinística):
//   · El país es 54 y el número nacional son SIEMPRE 10 dígitos.
//   · Esos 10 dígitos empiezan con 1, 2 o 3 (no existe uno que empiece con 9).
//   · El "9" que a veces aparece después del 54 NO es parte del número: es el
//     indicador de que el destino es un celular. Puede estar o no estar.
//   · Por eso: con 9 el total es 13 dígitos, sin 9 son 12.
//   · Como ningún nacional empieza con 9, si el dígito que sigue al 54 es un 9,
//     es el indicador. Cero ambigüedad.
//
// DOS FORMAS, UN SOLO CONCEPTO:
//   · `clave` = forma canónica para GUARDAR y COMPARAR identidades (sin el 9).
//   · `wa`    = forma para ENVIAR por WhatsApp (con el 9, que es lo que la app
//               necesita para abrir el chat de un celular).
//
// Otros países: no se inventa nada. Se usan los dígitos tal cual y se comparan
// completos — se acabó el `slice(-10)`, que podía hacer colisionar a un
// uruguayo con un argentino.

const AR = '54';
const AR_NACIONAL = /^[123]\d{9}$/;   // 10 dígitos, empieza con 1, 2 o 3

/** Solo los dígitos de cualquier cosa: "+54 9 11 5577-1290", "…@c.us", etc. */
function digitos(raw) {
  return String(raw == null ? '' : raw).replace(/\D+/g, '');
}

/**
 * Descompone un número. Devuelve siempre un objeto; `ok` dice si se pudo
 * interpretar con confianza.
 *
 *   canonico('+54 9 11 5577-1290') → { ok:true, pais:'54', nacional:'1155771290',
 *                                      clave:'541155771290', wa:'5491155771290',
 *                                      e164:'+5491155771290', esAR:true, esCelular:true }
 *   canonico('54 11 5577 1290')    → misma `clave`, mismo `wa`
 *   canonico('598 95 989 9643')    → { ok:true, esAR:false, clave:'598959899643', wa:idem }
 */
function canonico(raw) {
  const d = digitos(raw);
  if (!d) return { ok: false, motivo: 'sin dígitos', clave: '', wa: '', esAR: false };

  if (d.startsWith(AR)) {
    let resto = d.slice(2);
    let esCelular = false;
    // El 9 sobrante es el indicador de celular, no parte del número.
    if (resto.length === 11 && resto.startsWith('9')) { resto = resto.slice(1); esCelular = true; }
    if (AR_NACIONAL.test(resto)) {
      return {
        ok: true, esAR: true, esCelular,
        pais: AR, nacional: resto,
        clave: AR + resto,            // 12 dígitos, sin el 9 — para guardar/comparar
        wa: AR + '9' + resto,         // 13 dígitos, con el 9 — para enviar por WhatsApp
        e164: '+' + AR + '9' + resto,
      };
    }
    // Empieza con 54 pero no cierra con la regla: puede ser otro país cuyo
    // número arranca casualmente con 54, o un número mal cargado.
    return { ok: false, motivo: `"${raw}" empieza con 54 pero el nacional no son 10 dígitos que arranquen con 1, 2 o 3 (leí "${resto}")`,
             esAR: false, clave: d, wa: d };
  }

  // Resto del mundo: sin reglas inventadas. 8 a 15 dígitos (rango E.164).
  const ok = d.length >= 8 && d.length <= 15;
  return { ok, esAR: false, esCelular: false, clave: d, wa: d, e164: '+' + d,
           motivo: ok ? undefined : `"${raw}" tiene ${d.length} dígitos (E.164 admite 8 a 15)` };
}

/** Forma para GUARDAR y COMPARAR. '' si no se pudo interpretar. */
function clave(raw) { const c = canonico(raw); return c.clave || ''; }

/** Forma para ENVIAR por WhatsApp (con el 9 si es celular argentino). */
function paraWa(raw) { const c = canonico(raw); return c.wa || ''; }

/** wid de WhatsApp listo para usar: <digitos>@c.us (respeta @lid si ya viene). */
function wid(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (/@lid$/i.test(s)) return s;
  const w = paraWa(s);
  return w ? `${w}@c.us` : '';
}

/**
 * ¿Son la misma persona? Compara por forma canónica, así "54 11 5577 1290" y
 * "+54 9 11 5577-1290" dan true, y un uruguayo nunca matchea con un argentino
 * por compartir los últimos dígitos.
 */
function mismoNumero(a, b) {
  const ka = clave(a), kb = clave(b);
  return !!ka && !!kb && ka === kb;
}

/**
 * Variantes de un número tal como puede estar guardado en datos viejos (con y
 * sin el 9). Sirve para los LIKE de SQL mientras no migremos la libreta.
 */
function variantes(raw) {
  const c = canonico(raw);
  if (!c.esAR) return c.clave ? [c.clave] : [];
  return [c.clave, c.wa];
}

module.exports = { canonico, clave, paraWa, wid, mismoNumero, variantes, digitos };
