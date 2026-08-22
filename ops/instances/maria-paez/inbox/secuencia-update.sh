#!/bin/bash
cat > /tmp/su.cjs <<'JS'
const c=require("/root/secretaria/mb-control.js");
console.log("home:", c.encolar("home"));
console.log("tap MariaBridge:", c.encolar("tap",{x:446,y:816}));
console.log("nodos (pantalla de la app):", c.encolar("nodos"));
JS
node /tmp/su.cjs; rm -f /tmp/su.cjs
echo LISTO
