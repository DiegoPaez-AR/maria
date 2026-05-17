#!/bin/bash
set +e
echo "═══ pm2 ═══"
pm2 jlist 2>/dev/null | python3 -c 'import sys,json; d=[x for x in json.load(sys.stdin) if x["name"]=="maria-paez"]; r=d[0] if d else None; print("pid:", r["pid"], "restart:", r["pm2_env"]["restart_time"]) if r else print("no")'

echo ""
echo "═══ Código vivo tiene fix? ═══"
grep -c "_variantesArMobile" /root/secretaria/usuarios.js
grep -c "DIAG2 vcard" /root/secretaria/whatsapp-handler.js

echo ""
echo "═══ Smoke test: resolverPorWa con/sin 9 ═══"
cd /root/secretaria && node -e "
const u = require('./usuarios');
const r1 = u.resolverPorWa('5491132317896@c.us');
const r2 = u.resolverPorWa('541132317896@c.us');
const r3 = u.resolverPorWa('5491150080522@c.us');
console.log('5491132317896@c.us (con 9) →', r1 ? r1.nombre + ' id=' + r1.id : 'null');
console.log('541132317896@c.us  (sin 9) →', r2 ? r2.nombre + ' id=' + r2.id : 'null');
console.log('5491150080522@c.us (Nico) →', r3 ? r3.nombre + ' id=' + r3.id : 'null');
"
