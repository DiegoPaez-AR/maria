#!/bin/bash
# Verifica que tras el fix del cron-master.sh, el env del .conf se propaga.
set +e
echo "═══ env actual ═══"
echo "MARIA_DB=$MARIA_DB"
echo "ASISTENTE_SLUG=$ASISTENTE_SLUG"
echo "MARIA_VAULT_KEY=${MARIA_VAULT_KEY:+(seteado)}${MARIA_VAULT_KEY:-(no seteado)}"
echo "GOOGLE_TOKEN_PATH=$GOOGLE_TOKEN_PATH"

echo ""
echo "═══ node ve MARIA_DB correcta ═══"
cd /root/secretaria && node -e "
console.log('process.env.MARIA_DB =', process.env.MARIA_DB || '(unset)');
const u = require('./usuarios');
const lista = u.listarActivos();
console.log('listarActivos count:', lista.length);
console.log('nombres:', lista.map(x => x.nombre).join(', '));
" 2>&1

echo ""
echo "═══ resolverPorWa con/sin 9 (debería resolver TODOS ahora) ═══"
cd /root/secretaria && node -e "
const u = require('./usuarios');
const tests = [
  ['Diego con 9',  '5491132317896@c.us'],
  ['Diego sin 9',  '541132317896@c.us'],
  ['Doris con 9',  '5491144471264@c.us'],
  ['Doris sin 9',  '541144471264@c.us'],
  ['Enrique UY',   '59899643028@c.us'],
];
for (const [label, wa] of tests) {
  const r = u.resolverPorWa(wa);
  console.log(label.padEnd(15), wa.padEnd(22), '→', r ? r.id + ' ' + r.nombre : 'null');
}
" 2>&1
