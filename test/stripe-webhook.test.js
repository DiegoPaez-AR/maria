// node --test — firma de webhook Stripe (lib pura, sin red).
const { test } = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const { verifyWebhook, unixToIso } = require('../ops/backend/intensa-api/lib/stripe.js');

const SECRET = 'whsec_test_abc123';
function firmar(body, { t = Math.floor(Date.now() / 1000), secret = SECRET } = {}) {
  const sig = crypto.createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  return `t=${t},v1=${sig}`;
}

test('firma válida devuelve el evento parseado', () => {
  const body = JSON.stringify({ id: 'evt_1', type: 'invoice.paid' });
  const ev = verifyWebhook(body, firmar(body), SECRET);
  assert.equal(ev.id, 'evt_1');
  assert.equal(ev.type, 'invoice.paid');
});

test('body adulterado se rechaza con 401', () => {
  const body = JSON.stringify({ id: 'evt_1', amount: 100 });
  const header = firmar(body);
  const adulterado = body.replace('100', '999');
  assert.throws(() => verifyWebhook(adulterado, header, SECRET), (e) => e.status === 401);
});

test('firma con secret equivocado se rechaza', () => {
  const body = '{"id":"evt_2"}';
  const header = firmar(body, { secret: 'whsec_otro' });
  assert.throws(() => verifyWebhook(body, header, SECRET), (e) => e.status === 401);
});

test('timestamp fuera de tolerancia se rechaza', () => {
  const body = '{"id":"evt_3"}';
  const viejo = Math.floor(Date.now() / 1000) - 600; // 10min > 300s
  assert.throws(() => verifyWebhook(body, firmar(body, { t: viejo }), SECRET), /tolerancia/);
});

test('header ausente / malformado → 401; sin secret → 503', () => {
  assert.throws(() => verifyWebhook('{}', null, SECRET), (e) => e.status === 401);
  assert.throws(() => verifyWebhook('{}', 'garbage', SECRET), (e) => e.status === 401);
  assert.throws(() => verifyWebhook('{}', 't=1,v1=abc', ''), (e) => e.status === 503);
});

test('multiple v1: alcanza con que una matchee', () => {
  const body = '{"id":"evt_4"}';
  const t = Math.floor(Date.now() / 1000);
  const buena = crypto.createHmac('sha256', SECRET).update(`${t}.${body}`).digest('hex');
  const ev = verifyWebhook(body, `t=${t},v1=${'0'.repeat(64)},v1=${buena}`, SECRET);
  assert.equal(ev.id, 'evt_4');
});

test('unixToIso', () => {
  assert.equal(unixToIso(0), '1970-01-01T00:00:00.000Z');
  assert.equal(unixToIso(null), null);
  assert.equal(unixToIso('no-numero'), null);
});
