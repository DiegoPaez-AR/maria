// node --test — normalizarWaCus con cliente WA mockeado (sin red).
const { test } = require('node:test');
const assert = require('node:assert');
const { normalizarWaCus } = require('../wa-validate.js');

const clientMock = (conocidos) => ({
  async getNumberId(digitos) {
    return conocidos[digitos] ? { _serialized: `${digitos}@c.us` } : null;
  },
});

test('null/vacío → null', async () => {
  assert.equal(await normalizarWaCus(null, clientMock({})), null);
  assert.equal(await normalizarWaCus('   ', clientMock({})), null);
});

test('número con formato humano se normaliza a @c.us', async () => {
  const c = clientMock({ '598959899643': true });
  assert.equal(await normalizarWaCus('+598 95 989-9643', c), '598959899643@c.us');
});

test('fallback 9-móvil AR: 54... prueba también 549...', async () => {
  const c = clientMock({ '5491165551234': true }); // solo existe CON 9
  assert.equal(await normalizarWaCus('54 11 6555 1234', c), '5491165551234@c.us');
});

test('fallback inverso: 549... prueba también 54...', async () => {
  const c = clientMock({ '541165551234': true }); // solo existe SIN 9
  assert.equal(await normalizarWaCus('+54 9 11 6555 1234', c), '541165551234@c.us');
});

test('sin client (era bridge) → normaliza offline, no explota', async () => {
  assert.equal(await normalizarWaCus('5491100000000', null), '5491100000000@c.us');
  // AR sin el "9" móvil se completa (formato de envío del bridge)
  assert.equal(await normalizarWaCus('+54 11 6555 1234', null), '5491165551234@c.us');
});

test('sin client + numero imposible -> error instructivo', async () => {
  // Los mensajes los arma telefonos.js desde 2026-08-23.
  await assert.rejects(() => normalizarWaCus('123', null), /8 a 15/);
  await assert.rejects(() => normalizarWaCus('hola', null), /sin dígitos|no contiene dígitos/);
  await assert.rejects(() => normalizarWaCus('54 9 9 9999 9999', null), /1, 2 o 3/);
});

test('sin client: AR se normaliza a la forma de envio (con el 9 de celular)', async () => {
  assert.equal(await normalizarWaCus('54 11 5577 1290', null), '5491155771290@c.us');
  assert.equal(await normalizarWaCus('+54 9 11 5577-1290', null), '5491155771290@c.us');
  assert.equal(await normalizarWaCus('+598 95 989 9643', null), '598959899643@c.us');
});

test('sin dígitos → error', async () => {
  await assert.rejects(() => normalizarWaCus('hola', clientMock({})), /no contiene dígitos/);
});
