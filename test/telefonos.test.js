// node --test — la regla argentina, con los casos reales que ya nos costaron caro.
const { test } = require('node:test');
const assert = require('node:assert');
const tel = require('../telefonos.js');

test('AR: el 9 es indicador de celular, no parte del número', () => {
  const conNueve = tel.canonico('+54 9 11 5577-1290');
  const sinNueve = tel.canonico('54 11 5577 1290');
  assert.equal(conNueve.nacional, '1155771290');
  assert.equal(sinNueve.nacional, '1155771290');
  assert.equal(conNueve.clave, sinNueve.clave, 'la clave canónica tiene que ser la misma');
  assert.equal(conNueve.clave, '541155771290');       // guardar/comparar: SIN el 9
  assert.equal(conNueve.wa, '5491155771290');          // enviar por WA: CON el 9
});

test('caso Manuel Carrasco (23/8): las dos formas son la misma persona', () => {
  // La libreta lo tenía sin 9 y el outbox servía con 9 → el nombre salía vacío
  // y el envío abortaba con chat_equivocado.
  assert.ok(tel.mismoNumero('5491155771290@c.us', '541155771290@c.us'));
  assert.deepEqual(tel.variantes('541155771290@c.us').sort(),
                   ['541155771290', '5491155771290'].sort());
});

test('el nacional argentino son 10 dígitos que empiezan con 1, 2 o 3', () => {
  assert.ok(tel.canonico('+54 11 4788-1234').ok);      // fijo CABA
  assert.ok(tel.canonico('+54 341 555 1234').ok);      // Rosario
  assert.ok(tel.canonico('+54 2954 12 3456').ok);      // La Pampa
  // Ningún número argentino empieza con 9 después del código de país:
  const raro = tel.canonico('54 9 9 9999 9999');       // el 2º 9 no puede abrir el nacional
  assert.equal(raro.ok, false);
});

test('caso Enrique Sosa: un uruguayo no colisiona con un argentino', () => {
  // Antes se comparaban los últimos 10 dígitos a secas.
  assert.equal(tel.mismoNumero('5491155771290', '598155771290'), false);
  const uy = tel.canonico('+598 95 989 9643');
  assert.equal(uy.esAR, false);
  assert.equal(uy.clave, '598959899643');
  assert.equal(uy.wa, uy.clave, 'a un no-argentino no se le agrega ningún 9');
});

test('entra en cualquier formato y sale igual', () => {
  const esperado = '541155771290';
  for (const forma of ['+54 9 11 5577-1290', '5491155771290@c.us', '54 11 5577 1290',
                       '541155771290@c.us', '  +54-9-11-5577-1290  ']) {
    assert.equal(tel.clave(forma), esperado, `falló con "${forma}"`);
  }
});

test('wid respeta los @lid y no inventa números', () => {
  assert.equal(tel.wid('12345678901234567@lid'), '12345678901234567@lid');
  assert.equal(tel.wid('54 11 5577 1290'), '5491155771290@c.us');
  assert.equal(tel.wid('hola'), '');
});

test('basura y números imposibles no pasan', () => {
  assert.equal(tel.canonico('hola').ok, false);
  assert.equal(tel.canonico('123').ok, false);
  assert.equal(tel.mismoNumero('', '541155771290'), false);
});
