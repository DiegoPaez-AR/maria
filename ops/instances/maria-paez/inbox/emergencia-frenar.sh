#!/bin/bash
cd /root/secretaria
echo "== 1. PAUSAR re-campaña restante (verificado) =="
bash ops/tools/programados-ctl.sh pausar 1368 1369 1370 1371 1372 1373 1374
echo "== 2. VENCER todo el outbox pendiente (cortar el martilleo) =="
cat > /tmp/emg.cjs <<'JS'
const db=require("/root/secretaria/node_modules/better-sqlite3")(process.env.MARIA_DB);
const r=db.prepare(`UPDATE wa_outbox SET estado='vencido' WHERE estado='pendiente'`).run();
console.log("outbox pendientes vencidos:",r.changes);
db.close();
JS
node /tmp/emg.cjs; rm -f /tmp/emg.cjs
echo "== 3. logs MB: por qué fallan los fríos =="
grep "\[MB " ~/.pm2/logs/maria-paez-out.log | grep -E "frio|FALLO|ABIERTO" | tail -15
echo LISTO
