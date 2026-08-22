#!/bin/bash
cat > /tmp/dr1.cjs <<'JS'
const c=require("/root/secretaria/mb-control.js");
console.log("home:", c.encolar("home"));
console.log("tap MariaBridge:", c.encolar("tap",{x:446,y:816}));
console.log("nodos (ver botones de la app):", c.encolar("nodos"));
JS
node /tmp/dr1.cjs; rm -f /tmp/dr1.cjs
echo LISTO
