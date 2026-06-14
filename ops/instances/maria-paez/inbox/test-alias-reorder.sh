#!/bin/bash
set +e
cd /root/secretaria || exit 1
cat > /tmp/test-ar.js <<'JS'
const mem = require('/root/secretaria/memory');
const u = require('/root/secretaria/usuarios');
const { ejecutarAcciones } = require('/root/secretaria/executor');
(async () => {
  // 0) ¿whatsapp-handler carga sin romper? (reorder)
  try { require('/root/secretaria/whatsapp-handler'); console.log('[handler] require OK'); }
  catch(e){ console.log('[handler] require FALLÓ:', e.message); }

  const owner = u.obtenerOwner();
  const ctx = { usuario: owner, waClient: null, canalOrigen: 'whatsapp' };

  // 1) alias agregar_contacto / crear_contacto / guardar_contacto → upsert
  for (const tipo of ['agregar_contacto','crear_contacto','guardar_contacto','upsert_contacto']) {
    mem.db.exec('SAVEPOINT tst');
    const nombre = 'ZZ_TEST_'+tipo;
    const r = await ejecutarAcciones([{ tipo, nombre, whatsapp: '5491100000000' }], ctx);
    const ok = r[0] && r[0].ok;
    const guardado = !!mem.db.prepare("SELECT 1 FROM contactos WHERE nombre=?").get(nombre);
    console.log(`[alias] ${tipo.padEnd(18)} -> ok=${ok} guardado=${guardado}` + (r[0]&&r[0].error?(' err='+r[0].error):''));
    mem.db.exec('ROLLBACK TO tst'); mem.db.exec('RELEASE tst');
  }

  // 2) acción inexistente sigue dando error claro (no alias accidental)
  const r2 = await ejecutarAcciones([{ tipo: 'inventada_xyz' }], ctx);
  console.log('[unknown] inventada_xyz -> ok=' + (r2[0]&&r2[0].ok) + ' err=' + (r2[0]&&r2[0].error));
})().catch(e=>console.log('FATAL', e.message, e.stack));
JS
timeout 60 node /tmp/test-ar.js 2>&1
rm -f /tmp/test-ar.js
