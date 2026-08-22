#!/bin/bash
cat > /tmp/dr3.cjs <<'JS'
const c=require("/root/secretaria/mb-control.js");
console.log("nodos (ver si apareció el instalador):", c.encolar("nodos"));
JS
node /tmp/dr3.cjs; rm -f /tmp/dr3.cjs
echo "── logs upd ──"; grep -E "\[upd\]|\[ctl\]" ~/.pm2/logs/maria-paez-out.log | tail -6
echo LISTO
