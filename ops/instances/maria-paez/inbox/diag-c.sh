#!/bin/bash
cat > /tmp/diag-c.cjs <<'JS'
const db=require("/root/secretaria/node_modules/better-sqlite3")(process.env.MARIA_DB,{readonly:true});
console.log("== ENTRANTES WA hoy desde 13:00Z ==");
db.prepare(`SELECT timestamp,de,nombre,substr(cuerpo,1,55) c FROM eventos WHERE canal='whatsapp' AND direccion='entrante' AND timestamp>='2026-08-17 13:00' ORDER BY id`).all()
  .forEach(x=>console.log(x.timestamp.slice(11,16),(x.nombre||String(x.de).slice(-8)),"|",String(x.c).replace(/\n/g," ")));
console.log("== origen Te debo consulta ==");
db.prepare(`SELECT id,cuando,enviado,usuario_id,destino,substr(texto,1,70) t FROM programados WHERE texto LIKE '%Te debo consulta%' ORDER BY id DESC LIMIT 6`).all()
  .forEach(x=>console.log("prog#"+x.id,x.cuando,"env:"+x.enviado,"u:"+x.usuario_id,x.destino,"|",x.t));
console.log("== pendientes recordados hoy ==");
db.prepare(`SELECT id,usuario_id,estado,ultimo_recordatorio,substr("desc",1,60) d FROM pendientes WHERE ultimo_recordatorio>='2026-08-17' ORDER BY id DESC LIMIT 8`).all()
  .forEach(x=>console.log("#"+x.id,"u:"+x.usuario_id,x.ultimo_recordatorio,"|",x.d));
db.close();
JS
node /tmp/diag-c.cjs
rm -f /tmp/diag-c.cjs
echo LISTO
