#!/bin/bash
set +e
DB="/root/secretaria/state/maria-paez/db/maria.sqlite"

echo "═══ Tabla usuarios completa (id, nombre, wa_lid, wa_cus, email) ═══"
sqlite3 -header -column "$DB" "SELECT id, nombre, wa_lid, wa_cus, email FROM usuarios WHERE activo = 1 ORDER BY id;"

echo ""
echo "═══ Verificación: ¿resolverPorWa resuelve cada wa_cus de vuelta al user correcto? ═══"
cd /root/secretaria && node -e "
const usuarios = require('./usuarios');
const list = usuarios.listarActivos();
for (const u of list) {
  const slots = [];
  if (u.wa_cus) slots.push({ tipo: 'wa_cus', valor: u.wa_cus });
  if (u.wa_lid) slots.push({ tipo: 'wa_lid', valor: u.wa_lid });
  for (const s of slots) {
    const resuelto = usuarios.resolverPorWa(s.valor);
    const ok = resuelto && resuelto.id === u.id;
    const marker = ok ? '✓' : '✗';
    const info = resuelto ? \`→ id=\${resuelto.id} (\${resuelto.nombre})\` : '→ null';
    console.log(\`  \${marker} \${u.nombre.padEnd(22)} \${s.tipo}=\${s.valor.padEnd(28)} \${info}\`);
  }
  if (slots.length === 0) {
    console.log(\`  ·  \${u.nombre.padEnd(22)} (sin wa_cus ni wa_lid — solo email)\`);
  }
}
" 2>&1

echo ""
echo "═══ Resumen formato wa_cus por país (regex prefijo) ═══"
sqlite3 -column "$DB" "
SELECT
  CASE
    WHEN wa_cus LIKE '549%' THEN '549 (AR móvil con 9)'
    WHEN wa_cus LIKE '54%' AND wa_cus NOT LIKE '549%' THEN '54 (AR sin 9)'
    WHEN wa_cus LIKE '598%' THEN '598 (UY)'
    WHEN wa_cus LIKE '595%' THEN '595 (PY)'
    WHEN wa_cus LIKE '55%' THEN '55 (BR)'
    WHEN wa_cus LIKE '34%' THEN '34 (ES)'
    WHEN wa_cus LIKE '1%' THEN '1 (US/CA)'
    WHEN wa_cus IS NULL THEN '(sin wa_cus)'
    ELSE 'otro (' || substr(wa_cus, 1, 3) || ')'
  END AS pais,
  COUNT(*) AS n,
  GROUP_CONCAT(nombre, ', ') AS users
FROM usuarios
WHERE activo = 1
GROUP BY 1
ORDER BY n DESC;
"
