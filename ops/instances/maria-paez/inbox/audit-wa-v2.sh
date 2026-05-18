#!/bin/bash
set +e
DB="/root/secretaria/state/maria-paez/db/maria.sqlite"

echo "═══ Verificación SQL: cada wa_cus matchea exactamente UN user activo ═══"
sqlite3 -header -column "$DB" "
SELECT
  u.id, u.nombre, u.wa_cus,
  (SELECT COUNT(*) FROM usuarios WHERE wa_cus = u.wa_cus AND activo = 1) AS matches
FROM usuarios u
WHERE u.activo = 1 AND u.wa_cus IS NOT NULL
ORDER BY u.id;
"

echo ""
echo "═══ Verificación SQL: cada wa_lid matchea exactamente UN user activo ═══"
sqlite3 -header -column "$DB" "
SELECT
  u.id, u.nombre, u.wa_lid,
  (SELECT COUNT(*) FROM usuarios WHERE wa_lid = u.wa_lid AND activo = 1) AS matches
FROM usuarios u
WHERE u.activo = 1 AND u.wa_lid IS NOT NULL
ORDER BY u.id;
"

echo ""
echo "═══ Test runtime: resolverPorWa para cada usuario (one-shot) ═══"
cd /root/secretaria && node -e "
process.on('uncaughtException', e => { console.error('UNCAUGHT:', e.message); process.exit(1); });
const usuarios = require('./usuarios');
const list = usuarios.listarActivos();
console.log('total activos:', list.length);
let ok=0, fail=0;
for (const u of list) {
  try {
    if (u.wa_cus) {
      const r = usuarios.resolverPorWa(u.wa_cus);
      if (r && r.id === u.id) ok++; else { fail++; console.log('FAIL wa_cus', u.id, u.nombre, '→', r && r.id); }
    }
    if (u.wa_lid) {
      const r = usuarios.resolverPorWa(u.wa_lid);
      if (r && r.id === u.id) ok++; else { fail++; console.log('FAIL wa_lid', u.id, u.nombre, '→', r && r.id); }
    }
  } catch (e) { fail++; console.log('THROW', u.id, u.nombre, e.message); }
}
console.log('resueltos OK:', ok, 'fallaron:', fail);
" 2>&1

echo ""
echo "═══ Test fallback 9-móvil: usuarios AR resuelven con/sin 9 ═══"
cd /root/secretaria && node -e "
const u = require('./usuarios');
const tests = [
  // user 1 Diego: en DB sin 9, probar con 9 y sin
  '541132317896@c.us', '5491132317896@c.us',
  // user 6 Doris: en DB con 9, probar sin
  '5491144471264@c.us', '541144471264@c.us',
];
for (const t of tests) {
  const r = u.resolverPorWa(t);
  console.log(t.padEnd(28), '→', r ? r.id + ' (' + r.nombre + ')' : 'null');
}
" 2>&1
