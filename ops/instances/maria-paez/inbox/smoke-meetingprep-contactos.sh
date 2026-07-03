#!/bin/bash
cd /root/secretaria
rm -f /tmp/smoke-mp.sqlite
MARIA_DB=/tmp/smoke-mp.sqlite MARIA_VAULT_KEY=$(printf 'e%.0s' $(seq 64)) \
OWNER_NOMBRE='Owner Smoke' OWNER_WA='5491100000001' OWNER_EMAIL='owner@smoke.local' \
node - <<'NODE' 2>&1 | grep -vE "^\[memory\]"
(async () => {
  const mem = require('/root/secretaria/memory');
  const usuarios = require('/root/secretaria/usuarios');
  const mp = require('/root/secretaria/meeting-prep');
  const owner = usuarios.obtenerOwner();
  // pre-crear un homónimo para probar la desambiguación
  mem.upsertContacto({ usuarioId: owner.id, nombre: 'Satya', email: 'otro.satya@x.com', visibilidad: 'privada' });
  const evento = {
    summary: 'Reunión smoke', start: new Date(Date.now() + 3600e3).toISOString(),
    attendees: ['satya@microsoft.com'], descripcion: '',
  };
  // _componerTexto no está exportada — la alcanzamos vía el módulo interno? No:
  // replicamos el camino llamando la función a través del require cache.
  const path = require.resolve('/root/secretaria/meeting-prep.js');
  const src = require('fs').readFileSync(path, 'utf8');
  // invocación directa: recompilamos el módulo en un contexto que exponga _componerTexto
  const Module = require('module');
  const m = new Module(path, null);
  m.filename = path; m.paths = Module._nodeModulePaths(require('path').dirname(path));
  m._compile(src + '\nmodule.exports._componerTexto = _componerTexto;', path);
  const texto = await m.exports._componerTexto(evento, owner);
  console.log('── texto del aviso ──');
  console.log(texto);
  const c = mem.buscarContacto({ usuarioId: owner.id, email: 'satya@microsoft.com' });
  console.log('── contacto creado ──');
  console.log(c ? `${c.nombre} <${c.email}> vis=${c.visibilidad} perfil_web=${c.perfil_web || '(sin datos)'}` : '✗ NO SE CREÓ');
  console.log(c && c.nombre !== 'Satya' ? 'desambiguación OK (' + c.nombre + ')' : (c ? '⚠️ pisó al homónimo?' : ''));
})().catch(e => { console.error('SMOKE FALLÓ:', e.message); process.exit(1); });
NODE
rm -f /tmp/smoke-mp.sqlite
echo LISTO
