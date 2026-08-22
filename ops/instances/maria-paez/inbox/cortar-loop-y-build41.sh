#!/bin/bash
cd /root/secretaria
cat > /tmp/cl.cjs <<'JS'
const db=require("/root/secretaria/node_modules/better-sqlite3")(process.env.MARIA_DB);
const r=db.prepare("UPDATE mb_control SET estado='cancelado', resultado='cancelado a mano (loop tap sin canPerformGestures)' WHERE estado IN ('pendiente','enviado')").run();
console.log("comandos cancelados:", r.changes);
db.close();
JS
node /tmp/cl.cjs; rm -f /tmp/cl.cjs
[ -f state/.canary-bad-commit ] && { echo "CANARY BLOQUEÓ"; exit 0; }
pm2 reload ecosystem.config.js --only maria-paez --update-env >/dev/null 2>&1 && echo "reload OK"
if pgrep -f mb-build-worker >/dev/null; then echo "build corriendo"; else nohup bash /root/mb-build-worker.sh >/dev/null 2>&1 & echo "build v4.1 lanzado"; fi
echo LISTO
