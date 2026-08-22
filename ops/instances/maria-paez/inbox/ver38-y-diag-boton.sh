#!/bin/bash
echo "── build v3.8 ──"
pgrep -f mb-build-worker >/dev/null && echo compilando || echo terminó
grep -E "APK_OK|APK_FAIL|^e: file" /root/mariabridge-build.log | tail -2
curl -s https://intensa.io/_dl/mariabridge-latest.json; echo ""
echo "── manos remotas: pedir dump de nodos (diagnóstico del botón send, NO envía nada) ──"
cat > /tmp/ctl.cjs <<'JS'
const c=require("/root/secretaria/mb-control.js");
console.log("comando encolado id:", c.encolar("nodos"));
JS
node /tmp/ctl.cjs; rm -f /tmp/ctl.cjs
echo LISTO
