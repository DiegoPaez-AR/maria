#!/bin/bash
cd /root/secretaria
cat > /tmp/c253.cjs <<'JS'
const db=require("/root/secretaria/node_modules/better-sqlite3")(process.env.MARIA_DB);
const r=db.prepare(`UPDATE pendientes SET estado='cancelado' WHERE id=253 AND estado='abierto'`).run();
console.log("pendiente #253 (Te debo consulta Natali) cancelado:", r.changes);
db.close();
JS
node /tmp/c253.cjs; rm -f /tmp/c253.cjs
if pgrep -f mb-build-worker >/dev/null; then echo "build corriendo"; else nohup bash /root/mb-build-worker.sh >/dev/null 2>&1 & echo "build v3.0 lanzado"; fi
echo LISTO
