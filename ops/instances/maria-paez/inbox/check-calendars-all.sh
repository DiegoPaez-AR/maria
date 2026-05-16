#!/bin/bash
# Para cada usuario activo: comparar calendar_acceso guardado vs el real
# que devuelve chequearAccesoCalendar(). Si difieren, actualizar.
set +e
set -a
. /root/secretaria/config/instances/maria-paez.conf
set +a
cd /root/secretaria

echo "═══ Estado actual de usuarios (DB) ═══"
sqlite3 -header -column "$MARIA_DB" "
SELECT id, nombre, calendar_id, calendar_acceso
FROM usuarios WHERE activo=1
ORDER BY id
"

echo ""
echo "═══ Chequeo real contra Google calendarList ═══"
node -e "
(async () => {
  const usuarios = require('./usuarios');
  const g = require('./google');
  const mem = require('./memory');
  const activos = usuarios.listarActivos();
  let cambios = 0;
  for (const u of activos) {
    if (!u.calendar_id) {
      console.log(\`  [\${u.id}] \${u.nombre}: calendar_id VACIO (skip)\`);
      continue;
    }
    let detectado;
    try {
      detectado = await g.chequearAccesoCalendar(u.calendar_id);
    } catch (err) {
      console.log(\`  [\${u.id}] \${u.nombre}: chequeo FALLO (\${err.message})\`);
      continue;
    }
    const actual = u.calendar_acceso || 'none';
    const flag = detectado === actual ? '✓ ok' : \`⚠️  actualizar (\${actual} → \${detectado})\`;
    console.log(\`  [\${u.id}] \${u.nombre.padEnd(20)} guardado=\${actual.padEnd(5)} detectado=\${detectado.padEnd(5)} \${flag}\`);
    if (detectado !== actual) {
      usuarios.setearCalendarAcceso(u.id, detectado);
      mem.log({
        usuarioId: u.id,
        canal: 'sistema', direccion: 'interno',
        cuerpo: \`calendar_acceso autodetectado: \${actual} → \${detectado}\`,
        metadata: { antes: actual, despues: detectado, fuente: 'manual-check' },
      });
      cambios++;
    }
  }
  console.log('');
  console.log(\`Total cambios aplicados: \${cambios}\`);
})();
"

echo ""
echo "═══ Estado final tras correcciones ═══"
sqlite3 -header -column "$MARIA_DB" "
SELECT id, nombre, calendar_id, calendar_acceso, actualizado
FROM usuarios WHERE activo=1
ORDER BY id
"
