// vault.js — cifrado simétrico para datos sensibles persistidos.
//
// Uso típico: blobs de credenciales de proveedores externos (Microsoft Graph
// OAuth, CalDAV passwords, etc.) que viven en columnas TEXT de la DB. NO
// cifra el token.json de Maria ni la libreta de contactos.
//
// AES-256-GCM con key en env var MARIA_VAULT_KEY (32 bytes en hex = 64 chars).
// Generar con: openssl rand -hex 32
//
// Threat model que mitiga:
//   - Leak de la DB sola (backup mal manejado, snapshot, copia para debug).
// Threat model que NO mitiga:
//   - Compromiso completo del VPS con shell. La key vive en runtime, quien
//     acceda al runtime puede descifrar. Para eso haría falta KMS externo,
//     fuera del scope actual.

const crypto = require('crypto');

function _getKey() {
  const hex = process.env.MARIA_VAULT_KEY;
  if (!hex) {
    throw new Error('vault: MARIA_VAULT_KEY no seteado (esperado 64 chars hex = 32 bytes)');
  }
  const buf = Buffer.from(hex, 'hex');
  if (buf.length !== 32) {
    throw new Error(`vault: MARIA_VAULT_KEY debe ser 32 bytes (64 chars hex); obtuve ${buf.length} bytes`);
  }
  return buf;
}

/**
 * Cifra un objeto JSON y devuelve un string base64 que incluye iv + tag + ciphertext.
 * Devuelve null si el input es null/undefined (passthrough cómodo para columnas opcionales).
 */
function cifrar(obj) {
  if (obj == null) return null;
  const key = _getKey();
  const iv = crypto.randomBytes(12); // 96 bits, recomendado para GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = JSON.stringify(obj);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString('base64');
}

/**
 * Descifra un blob producido por cifrar() y devuelve el objeto original.
 * Devuelve null si el input es null/undefined.
 * Tira si la key cambió o el blob fue manipulado (GCM auth tag failure).
 */
function descifrar(b64) {
  if (b64 == null) return null;
  const key = _getKey();
  const buf = Buffer.from(b64, 'base64');
  if (buf.length < 12 + 16 + 1) {
    throw new Error(`vault.descifrar: blob demasiado corto (${buf.length} bytes)`);
  }
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return JSON.parse(pt.toString('utf8'));
}

/**
 * Auto-test: verifica que la key esté seteada y que cifrar→descifrar roundtrip funcione.
 * Devuelve { ok: true } o { ok: false, error }. Útil para healthcheck.
 */
function autoTest() {
  try {
    const probe = { test: true, ts: Date.now() };
    const blob = cifrar(probe);
    const back = descifrar(blob);
    if (back.test !== true) throw new Error('roundtrip falló: campo "test" no coincide');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = { cifrar, descifrar, autoTest };
