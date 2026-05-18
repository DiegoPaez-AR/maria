#!/usr/bin/env node
// scripts/smoke-test-detect.js — verifica detectarProvider() con varios emails.
//
// Standalone: no toca DB, no necesita env vars. Imprime cada caso con su
// detección y exit code 0 si todos los esperados pasan.

const { detectarProvider, descripcionProvider } = require('../providers/detect');

const casos = [
  // Google
  { email: 'diego@gmail.com',           esperado: { kind: 'google' } },
  { email: 'foo.bar@googlemail.com',    esperado: { kind: 'google' } },
  { email: 'MAYUSCULA@GMAIL.COM',       esperado: { kind: 'google' } },

  // iCloud
  { email: 'user@icloud.com',           esperado: { kind: 'caldav', subKind: 'icloud' } },
  { email: 'old@me.com',                esperado: { kind: 'caldav', subKind: 'icloud' } },
  { email: 'older@mac.com',             esperado: { kind: 'caldav', subKind: 'icloud' } },

  // Yahoo
  { email: 'user@yahoo.com',            esperado: { kind: 'caldav', subKind: 'yahoo' } },
  { email: 'user@yahoo.com.ar',         esperado: { kind: 'caldav', subKind: 'yahoo' } },
  { email: 'user@yahoo.es',             esperado: { kind: 'caldav', subKind: 'yahoo' } },
  { email: 'user@ymail.com',            esperado: { kind: 'caldav', subKind: 'yahoo' } },
  { email: 'user@rocketmail.com',       esperado: { kind: 'caldav', subKind: 'yahoo' } },

  // Fastmail
  { email: 'user@fastmail.com',         esperado: { kind: 'caldav', subKind: 'fastmail' } },
  { email: 'user@fastmail.fm',          esperado: { kind: 'caldav', subKind: 'fastmail' } },
  { email: 'user@messagingengine.com',  esperado: { kind: 'caldav', subKind: 'fastmail' } },

  // Microsoft (bloqueado)
  { email: 'user@outlook.com',          esperado: { kind: 'microsoft' } },
  { email: 'user@hotmail.com',          esperado: { kind: 'microsoft' } },
  { email: 'user@live.com',             esperado: { kind: 'microsoft' } },
  { email: 'user@msn.com',              esperado: { kind: 'microsoft' } },

  // Desconocido (custom)
  { email: 'user@miempresa.com.ar',     esperado: null },
  { email: 'foo@example.test',          esperado: null },

  // Edge cases
  { email: null,                         esperado: null },
  { email: '',                           esperado: null },
  { email: 'sin-arroba',                 esperado: null },
  { email: 'arroba-al-final@',           esperado: null },
];

let pasaron = 0;
let fallaron = 0;
let fails = [];

for (const c of casos) {
  const got = detectarProvider(c.email);
  let ok;
  if (c.esperado === null) {
    ok = got === null;
  } else {
    ok = got && got.kind === c.esperado.kind
      && (c.esperado.subKind === undefined || got.subKind === c.esperado.subKind)
      && (c.esperado.bloqueado === undefined || got.bloqueado === c.esperado.bloqueado);
  }
  const desc = got ? descripcionProvider(got) : '(null)';
  const marker = ok ? '✓' : '✗';
  console.log(`  ${marker}  "${c.email}"  →  ${desc}${got && got.server_url ? '  [' + got.server_url + ']' : ''}`);
  if (ok) {
    pasaron++;
  } else {
    fallaron++;
    fails.push({ email: c.email, esperado: c.esperado, got });
  }
}

console.log('');
console.log(`Resultados: ${pasaron} OK, ${fallaron} fallaron (de ${casos.length})`);
if (fallaron > 0) {
  console.log('Fallas:');
  for (const f of fails) {
    console.log(`  ${f.email}: esperado=${JSON.stringify(f.esperado)} got=${JSON.stringify(f.got)}`);
  }
  process.exit(1);
}
