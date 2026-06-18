#!/bin/bash
set +e
cd /root/secretaria || exit 1
cat > /tmp/bs.js <<'JS'
const u = require('/root/secretaria/usuarios');
const row = u.obtener(17);
console.log('usuario id=17 antes:', JSON.stringify(row ? {id:row.id, nombre:row.nombre, email:row.email, activo:row.activo} : null));
if (!row || !/santiago\s*paez/i.test(row.nombre || '')) {
  console.log('ABORT: id=17 NO es santiago paez — no toco nada.'); process.exit(1);
}
const r = u.desactivar(17);
console.log('desactivar() ->', JSON.stringify(r));
const after = u.obtener(17);
console.log('usuario id=17 despues: activo =', after ? after.activo : '(?)');
JS
node /tmp/bs.js 2>&1; rm -f /tmp/bs.js
echo ""
echo "== estado del cliente en control DB (queda activo si no lo tocamos) =="
sqlite3 -line /root/secretaria/state/control/control.sqlite "SELECT id,nombre,email,estado,instancia_usuario_id,lemon_subscription_id FROM clientes WHERE instancia_usuario_id=17 OR email='santiago@paez.is';" 2>/dev/null
