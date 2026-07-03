// node --test — códigos de vinculación Telegram (puro, en memoria).
const { test } = require('node:test');
const assert = require('node:assert');
const vinculos = require('../telegram-vinculos.js');

test('generar → consumir devuelve el usuario y es one-shot', () => {
  const c = vinculos.generar(7);
  assert.match(c, /^\d{6}$/);
  assert.equal(vinculos.consumir(c), 7);
  assert.equal(vinculos.consumir(c), null, 'one-shot: segunda vez null');
});

test('código inválido → null', () => {
  assert.equal(vinculos.consumir('000000'), null);
  assert.equal(vinculos.consumir('nada'), null);
});

test('pedir de nuevo pisa el código anterior del mismo usuario', () => {
  const c1 = vinculos.generar(9);
  const c2 = vinculos.generar(9);
  assert.notEqual(c1, c2);
  assert.equal(vinculos.consumir(c1), null, 'el viejo quedó invalidado');
  assert.equal(vinculos.consumir(c2), 9);
});
