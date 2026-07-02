// node --test — vault AES-256-GCM (puro, key de test por env).
process.env.MARIA_VAULT_KEY = 'a'.repeat(64); // key de TEST, nunca la real
const { test } = require('node:test');
const assert = require('node:assert');
const vault = require('../vault.js');

test('roundtrip objeto', () => {
  const obj = { refresh_token: 'rt_xyz', nested: { a: [1, 2, 3] }, ñ: 'acentós' };
  const enc = vault.cifrar(obj);
  assert.equal(typeof enc, 'string');
  assert.ok(!enc.includes('rt_xyz'), 'el ciphertext no contiene el plaintext');
  assert.deepEqual(vault.descifrar(enc), obj);
});

test('dos cifrados del mismo objeto difieren (IV aleatorio)', () => {
  const obj = { x: 1 };
  assert.notEqual(vault.cifrar(obj), vault.cifrar(obj));
});

test('ciphertext adulterado no descifra (GCM auth)', () => {
  const enc = vault.cifrar({ secreto: 'x' });
  const buf = Buffer.from(enc, 'base64');
  buf[buf.length - 1] ^= 0xff;
  assert.throws(() => vault.descifrar(buf.toString('base64')));
});

test('null passthrough + autoTest', () => {
  assert.equal(vault.cifrar(null), null);
  assert.ok(vault.autoTest());
});
