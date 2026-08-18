#!/bin/bash
cat > /tmp/lcf.cjs <<'JS'
const db=require("/root/secretaria/node_modules/better-sqlite3")(process.env.MARIA_DB);
db.prepare(`SELECT id,numero,substr(texto,1,40) t FROM wa_outbox WHERE estado='pendiente'`).all().forEach(x=>console.log("venciendo #"+x.id,x.numero.slice(-8),"|",x.t));
console.log("vencidos:", db.prepare(`UPDATE wa_outbox SET estado='vencido' WHERE estado='pendiente'`).run().changes);
const p=db.prepare(`SELECT id,cuando,substr(texto,1,50) t,destino FROM programados WHERE enviado=0 AND cuando<=datetime('now','+36 hours')`).all();
p.forEach(x=>console.log("programado #"+x.id,x.cuando,x.destino,"|",x.t));
db.close();
JS
node /tmp/lcf.cjs; rm -f /tmp/lcf.cjs
echo LISTO
