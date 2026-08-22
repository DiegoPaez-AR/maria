#!/bin/bash
cat > /tmp/dr2.cjs <<'JS'
const c=require("/root/secretaria/mb-control.js");
console.log("tap 'Buscar actualización' (360,883):", c.encolar("tap",{x:360,y:883}));
JS
node /tmp/dr2.cjs; rm -f /tmp/dr2.cjs
echo LISTO
