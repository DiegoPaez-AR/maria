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

test('sin client → error instructivo', async () => {
  await assert.rejects(() => normalizarWaCus('5491100000000', null), /no tengo cliente/);
});

test('sin dígitos → error', async () => {
  await assert.rejects(() => normalizarWaCus('hola', clientMock({})), /no contiene dígitos/);
});
