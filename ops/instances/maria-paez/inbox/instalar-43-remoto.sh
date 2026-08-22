#!/bin/bash
cd /root/secretaria
echo "── versión publicada ──"; curl -s https://intensa.io/_dl/mariabridge-latest.json; echo ""
cat > /tmp/i43.cjs <<'JS'
const c=require("/root/secretaria/mb-control.js");
console.log("home:", c.encolar("home"));
console.log("tap MariaBridge:", c.encolar("tap",{x:446,y:816}));
console.log("nodos (confirmar pantalla):", c.encolar("nodos"));
JS
node /tmp/i43.cjs; rm -f /tmp/i43.cjs
echo LISTO
