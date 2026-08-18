#!/bin/bash
echo "== 1. logs upd/instalador de la última hora =="
grep "\[MB " ~/.pm2/logs/maria-paez-out.log | grep -E "upd|instalador" | tail -12
echo "== 2. ¿arrancó v3.3? =="
grep "\[MB v3.3" ~/.pm2/logs/maria-paez-out.log | head -4
echo "== 3. el enviar_wa fallido de las 20:24 (23:24 UTC) =="
grep -B2 -A4 "enviar_wa" ~/.pm2/logs/maria-paez-out.log | grep -A4 -B2 "23:2[0-9]" | head -20
cat > /tmp/dn.cjs <<'JS'
const db=require("/root/secretaria/node_modules/better-sqlite3")(process.env.MARIA_DB,{readonly:true});
console.log("== eventos sistema 23:15-23:30 UTC (acciones/errores) ==");
db.prepare(`SELECT timestamp,substr(cuerpo,1,120) c FROM eventos WHERE canal='sistema' AND timestamp BETWEEN '2026-08-17 23:15' AND '2026-08-17 23:35' ORDER BY id`).all()
  .forEach(x=>console.log(x.timestamp.slice(11,19),"|",String(x.c).replace(/\n/g," ")));
console.log("== cadencia recordatorios: config ==");
db.close();
JS
node /tmp/dn.cjs; rm -f /tmp/dn.cjs
echo "== 4. cadencia de recordatorios en el código =="
grep -n "ultimo_recordatorio\|RECORDATORIO\|3 \* 60\|recordar" /root/secretaria/recordatorios*.js 2>/dev/null | head -8
ls /root/secretaria/*.js | xargs grep -ln "Te debo consulta" 2>/dev/null
echo LISTO
