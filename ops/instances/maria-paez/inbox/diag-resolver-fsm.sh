#!/bin/bash
set -uo pipefail
cd /root/secretaria

echo "── 1. proceso fresco: resolverPorWa('5491166010010@c.us') ──"
node -e "
const u = require('./usuarios');
const r = u.resolverPorWa('5491166010010@c.us');
console.log('resolver:', r ? '{id:'+r.id+', nombre:\"'+r.nombre+'\", wa_cus:\"'+r.wa_cus+'\"}' : 'null');
"

echo
echo "── 2. estado_usuario rows del owner relacionados a unknown-flow / FSM ──"
DB="$MARIA_DB"
sqlite3 -header "$DB" ".schema estado_usuario"
echo
sqlite3 -header "$DB" "
  SELECT * FROM estado_usuario
  WHERE clave LIKE '%whatsapp%' OR clave LIKE '%5491166010010%' OR clave LIKE '%santi%' OR clave LIKE '%prospecto%' OR clave LIKE '%unknown%' OR clave LIKE '%FSM%'
  ORDER BY actualizado DESC
  LIMIT 20;
"
