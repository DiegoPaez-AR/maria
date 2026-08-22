#!/bin/bash
cat > /tmp/vv5.cjs <<'JS'
const db=require("/root/secretaria/node_modules/better-sqlite3")(process.env.MARIA_DB,{readonly:true});
console.log("═══ 1. DERIVACIÓN: usuario por WA ═══");
db.prepare(`SELECT timestamp,direccion,substr(cuerpo,1,100) c,metadata_json m FROM eventos WHERE canal='whatsapp' AND timestamp>=datetime('now','-45 minutes') ORDER BY id`).all()
  .forEach(x=>{let t='';try{t=JSON.parse(x.m||'{}').tipo||''}catch{};console.log(" ",x.timestamp.slice(11,19),x.direccion==='entrante'?'←':'→',t,"|",String(x.c).replace(/\n/g," "))});
console.log("═══ 2. RESERVA a Catalino: outbox ═══");
db.prepare(`SELECT id,creado,estado,intentos,numero,substr(texto,1,80) t,metadata_json m FROM wa_outbox WHERE creado>=datetime('now','-45 minutes') ORDER BY id`).all()
  .forEach(x=>console.log("  #"+x.id,x.creado.slice(11,16),"["+x.estado+"] int:"+x.intentos,x.numero,"|",String(x.t).replace(/\n/g," ")));
console.log("═══ 3. pedido por Telegram + respuesta ═══");
db.prepare(`SELECT timestamp,direccion,substr(cuerpo,1,110) c FROM eventos WHERE canal='telegram' AND timestamp>=datetime('now','-45 minutes') ORDER BY id`).all()
  .forEach(x=>console.log(" ",x.timestamp.slice(11,19),x.direccion==='entrante'?'←':'→',String(x.c).replace(/\n/g," ")));
console.log("═══ 4. acciones ═══");
db.prepare(`SELECT timestamp,substr(cuerpo,1,90) c FROM eventos WHERE canal='sistema' AND timestamp>=datetime('now','-45 minutes') AND (cuerpo LIKE '%acción%' OR cuerpo LIKE '%wa-hook%') ORDER BY id`).all()
  .forEach(x=>console.log(" ",x.timestamp.slice(11,19),String(x.c).replace(/\n/g," ")));
db.close();
JS
node /tmp/vv5.cjs; rm -f /tmp/vv5.cjs
echo "═══ 5. MariaBridge: cómo salió el envío ═══"
grep "\[MB " ~/.pm2/logs/maria-paez-out.log | tail -12
echo LISTO
