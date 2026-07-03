// node --test — ruteo del switch del executor: cada acción llega a SU handler.
// Nace del bug 2026-07-03: un cleanup dejó a upsert_contacto en fall-through
// hacia cambiar_visibilidad_contacto (la paridad de nombres no lo detecta).
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const TMP_DB = path.join(os.tmpdir(), `test-executor-${process.pid}.sqlite`);
try { fs.unlinkSync(TMP_DB); } catch {}
process.env.MARIA_DB = TMP_DB;
process.env.MARIA_VAULT_KEY = 'd'.repeat(64);
process.env.OWNER_NOMBRE = 'Owner Test';
process.env.OWNER_WA = '5491100000001';
process.env.OWNER_EMAIL = 'owner@test.local';
process.env.ASISTENTE_FROM_EMAIL = 'maria@test.local';
process.env.ASISTENTE_NOMBRE = 'Maria Test';
process.env.ASISTENTE_TZ = 'America/Argentina/Buenos_Aires'; // google.js exige FROM_EMAIL + FROM_NAME + TZ al require
process.env.GOOGLE_TOKEN_PATH = path.join(os.tmpdir(), 'test-token.json');
process.env.GOOGLE_CRED_PATH = path.join(os.tmpdir(), 'test-cred.json');

const { test, after } = require('node:test');
const assert = require('node:assert');
const { ejecutarAcciones } = require('../executor.js');
const usuarios = require('../usuarios.js');
const mem = require('../memory.js');

after(() => { try { fs.unlinkSync(TMP_DB); } catch {} });

test('paridad de nombres: switch del executor ↔ tools de action-schemas', () => {
  const { TOOLS } = require('../action-schemas.js');
  const src = fs.readFileSync(path.join(__dirname, '..', 'executor.js'), 'utf8');
  const sw = src.slice(src.indexOf('async function ejecutarUna'), src.indexOf('// ─── Calendar'));
  const cases = new Set([...sw.matchAll(/case '([a-z_]+)':/g)].map(m => m[1]));
  const tools = new Set(TOOLS.map(t => t.name));
  assert.deepEqual([...cases].filter(x => !tools.has(x)), [], 'cases sin tool');
  assert.deepEqual([...tools].filter(x => !cases.has(x)), [], 'tools sin case');
});

test('upsert_contacto llega a SU handler (anti fall-through)', async () => {
  const owner = usuarios.obtenerOwner();
  const [r] = await ejecutarAcciones(
    [{ tipo: 'upsert_contacto', nombre: 'Contacto Ruteo Test', notas: 'test' }],
    { usuario: owner, waClient: null, canalOrigen: 'whatsapp' },
  );
  assert.equal(r.ok, true, `upsert falló: ${r.error}`);
  const c = mem.todosLosContactos(owner.id).find(x => x.nombre === 'Contacto Ruteo Test');
  assert.ok(c, 'el contacto tiene que existir tras upsert_contacto');
});

test('recordar_hecho / olvidar_hecho rutean bien', async () => {
  const owner = usuarios.obtenerOwner();
  const [r1] = await ejecutarAcciones([{ tipo: 'recordar_hecho', clave: '_t', valor: 'v' }], { usuario: owner, canalOrigen: 'whatsapp' });
  assert.equal(r1.ok, true);
  const [r2] = await ejecutarAcciones([{ tipo: 'olvidar_hecho', clave: '_t' }], { usuario: owner, canalOrigen: 'whatsapp' });
  assert.equal(r2.ok, true);
});

test('upsert_contacto: variante de tilde / mismo tel bajo otro nombre → pregunta, no duplica', async () => {
  const owner = usuarios.obtenerOwner();
  const [r0] = await ejecutarAcciones([{ tipo: 'upsert_contacto', nombre: 'Rubén Prueba', whatsapp: '5491144445555', email: 'ruben@prueba.com' }], { usuario: owner, canalOrigen: 'whatsapp' });
  assert.equal(r0.ok, true, `alta inicial falló: ${r0.error}`);
  // misma persona sin tilde → debe frenar y pedir decisión
  const [r1] = await ejecutarAcciones([{ tipo: 'upsert_contacto', nombre: 'Ruben Prueba', email: 'otro@x.com' }], { usuario: owner, canalOrigen: 'whatsapp' });
  assert.equal(r1.ok, false);
  assert.match(r1.error, /DUPLICADO/);
  // mismo teléfono bajo otro nombre → frena
  const [r2] = await ejecutarAcciones([{ tipo: 'upsert_contacto', nombre: 'Persona Nueva', whatsapp: '54 9 11 4444-5555' }], { usuario: owner, canalOrigen: 'whatsapp' });
  assert.equal(r2.ok, false);
  assert.match(r2.error, /DUPLICADO/);
  // forzar_nuevo → crea aparte
  const [r3] = await ejecutarAcciones([{ tipo: 'upsert_contacto', nombre: 'Ruben Prueba (otro)', email: 'otro@x.com', forzar_nuevo: true }], { usuario: owner, canalOrigen: 'whatsapp' });
  assert.equal(r3.ok, true, `forzar_nuevo falló: ${r3.error}`);
  // nombre EXACTO → update legítimo sin frenar
  const [r4] = await ejecutarAcciones([{ tipo: 'upsert_contacto', nombre: 'Rubén Prueba', notas: 'nota nueva' }], { usuario: owner, canalOrigen: 'whatsapp' });
  assert.equal(r4.ok, true, `update exacto falló: ${r4.error}`);
});

test('tipo inexistente → error "Acción desconocida" (sin alias ni levenshtein)', async () => {
  const owner = usuarios.obtenerOwner();
  const [r] = await ejecutarAcciones([{ tipo: 'enviar_whatsapp', a: 'x', texto: 'x' }], { usuario: owner, canalOrigen: 'whatsapp' });
  assert.equal(r.ok, false);
  assert.match(r.error, /Acción desconocida/);
});
