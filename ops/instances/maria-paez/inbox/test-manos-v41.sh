#!/bin/bash
cat > /tmp/tm.cjs <<'JS'
const c=require("/root/secretaria/mb-control.js");
console.log("ping:", c.encolar("ping"));
console.log("home:", c.encolar("home"));
console.log("tap MariaBridge (446,816):", c.encolar("tap",{x:446,y:816}));
console.log("nodos:", c.encolar("nodos"));
JS
node /tmp/tm.cjs; rm -f /tmp/tm.cjs
echo LISTO
