// node --test — la poda del prompt de terceros: saca lo administrativo, deja lo vivo.
const { test } = require('node:test');
const assert = require('node:assert');
const { podarPromptTercero: _podarPromptTercero } = require('../prompt-tercero.js');

const SYSTEM_FIXTURE = `[CÓMO EJECUTÁS ACCIONES]
Tipos de acción disponibles:

  { "tipo": "crear_evento", "summary": "x" }
      // crea un evento
  { "tipo": "enviar_wa", "a": "541...", "texto": "..." }
  { "tipo": "crear_usuario", "nombre": "X" }
      // da de alta un usuario
      // más comentario del alta
  { "tipo": "configurar_caldav", "server_url": "..." }
      // onboarding caldav
  { "tipo": "upsert_contacto", "nombre": "..." }
  { "tipo": "buscar_slots_comunes", "usuarios": [] }
      // cruza calendarios

REGLAS: no confirmar sin verificar.`;

const USER_FIXTURE = `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[AGENDA DE DIEGO]
eventos...

[CONSULTAS ABIERTAS DE DIEGO — dueno=usuario · disparador=respuesta_usuario]
1. algo privado del usuario

[TAREAS DE DIEGO — dueno=usuario · disparador=manual]
2. DDJJ 2025

[TAREAS PROPIAS DE MARIA — dueno=maria]
3. esperando respuesta del restaurante

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[MENSAJES PROGRAMADOS — cola de envíos diferidos de Diego]
- mensaje programado privado

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[CUMPLEAÑOS PRÓXIMOS]
- mamá de Diego

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[PROSPECTOS PENDIENTES DE CONFIRMACIÓN — sólo vos (owner) los podés cerrar]
detalle prospectos
ONBOARDING DE USER NUEVO (post creación):
bienvenida enorme...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[FORMATO DE RESPUESTA — CANAL WHATSAPP]
el formato`;

test('saca las acciones administrativas y deja las operativas', () => {
  const { system } = _podarPromptTercero(SYSTEM_FIXTURE, USER_FIXTURE);
  for (const fuera of ['crear_usuario', 'configurar_caldav', 'buscar_slots_comunes'])
    assert.ok(!system.includes(`"${fuera}"`), `${fuera} debería estar afuera`);
  for (const queda of ['crear_evento', 'enviar_wa', 'upsert_contacto'])
    assert.ok(system.includes(`"${queda}"`), `${queda} debería quedar`);
  assert.ok(system.includes('REGLAS: no confirmar sin verificar'), 'las reglas quedan');
});

test('saca lo privado del usuario pero deja las gestiones de Maria', () => {
  const { user } = _podarPromptTercero(SYSTEM_FIXTURE, USER_FIXTURE);
  assert.ok(!user.includes('algo privado del usuario'), 'consultas del usuario afuera');
  assert.ok(!user.includes('DDJJ 2025'), 'tareas personales afuera');
  assert.ok(!user.includes('mensaje programado privado'), 'programados afuera');
  assert.ok(!user.includes('mamá de Diego'), 'cumpleaños afuera');
  assert.ok(!user.includes('ONBOARDING DE USER NUEVO'), 'onboarding afuera');
  assert.ok(user.includes('esperando respuesta del restaurante'), 'las gestiones de Maria QUEDAN');
  assert.ok(user.includes('[AGENDA DE DIEGO]'), 'la agenda queda');
  assert.ok(user.includes('[FORMATO DE RESPUESTA'), 'el formato queda');
});
