#!/bin/bash
echo "== MB log completo 12:55-13:05 ART (ventana entrega Nicolas) =="
grep "\[MB " ~/.pm2/logs/maria-paez-out.log | awk '$2>="12:55:00" && $2<="13:10:00"' | head -12
echo "== TODAS las lineas [notif] entrante de hoy =="
grep "\[MB " ~/.pm2/logs/maria-paez-out.log | grep "notif\] entrante" | tail -25
cat > /tmp/diag-d.cjs <<'JS'
const db=require("/root/secretaria/node_modules/better-sqlite3")(process.env.MARIA_DB,{readonly:true});
console.log("== texto completo del Te debo consulta (outbox #70) ==");
const r=db.prepare(`SELECT texto FROM wa_outbox WHERE id=70`).get();
console.log(r ? r.texto.slice(0,400) : "no está");
console.log("== pendientes 253 y 263 completos ==");
db.prepare(`SELECT id,usuario_id,estado,creado,ultimo_recordatorio,"desc" d,meta_json FROM pendientes WHERE id IN (253,263)`).all()
  .forEach(x=>console.log("#"+x.id,"u:"+x.usuario_id,x.estado,"creado:"+String(x.creado).slice(5,16),"| "+String(x.d).slice(0,120)));
db.close();
JS
node /tmp/diag-d.cjs; rm -f /tmp/diag-d.cjs
echo LISTO
