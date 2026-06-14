#!/bin/bash
set +e
cd /root/secretaria || exit 1
cat > /tmp/test-servido.js <<'JS'
const mem = require('/root/secretaria/memory');
const u = require('/root/secretaria/usuarios');
console.log('== columna servido existe? ==');
const cols = mem.db.prepare("PRAGMA table_info(usuarios)").all().map(c=>c.name);
console.log('servido in cols:', cols.includes('servido'));
console.log('\n== estado actual (todos deberían servido=1) ==');
for (const x of mem.db.prepare("SELECT id,nombre,rol,activo,servido FROM usuarios ORDER BY id").all())
  console.log(`  id=${x.id} ${x.nombre} rol=${x.rol} activo=${x.activo} servido=${x.servido}`);
console.log('\n== listarActivos vs listarServidos (ahora deben ser iguales) ==');
console.log('  activos  =', u.listarActivos().length);
console.log('  servidos =', u.listarServidos().length);
console.log('  owner sigue resolviendo:', !!u.obtenerOwner(), u.obtenerOwner() && u.obtenerOwner().nombre);

console.log('\n== prueba con un servido=0 (transacción con ROLLBACK, no persiste) ==');
try {
  const tx = mem.db.transaction(() => {
    mem.db.prepare("INSERT INTO usuarios (nombre,email,rol,activo,servido) VALUES ('ZZ_TEST_ADMIN','zz_test_admin@example.invalid','owner',1,0)").run();
    const act = u.listarActivos().some(x=>x.nombre==='ZZ_TEST_ADMIN');
    const srv = u.listarServidos().some(x=>x.nombre==='ZZ_TEST_ADMIN');
    const own = u.obtenerOwner();
    console.log('  dummy servido=0 -> en listarActivos:', act, '| en listarServidos:', srv);
    console.log('  obtenerOwner sigue devolviendo algo:', !!own);
    throw new Error('ROLLBACK_INTENCIONAL');
  });
  tx();
} catch(e) {
  console.log('  rollback ok (', e.message, ') — nada quedó persistido');
}
console.log('\n== confirmación post-rollback: dummy NO existe ==');
console.log('  dummy en DB?:', !!mem.db.prepare("SELECT 1 FROM usuarios WHERE nombre='ZZ_TEST_ADMIN'").get());
JS
timeout 60 node /tmp/test-servido.js 2>&1
rm -f /tmp/test-servido.js
