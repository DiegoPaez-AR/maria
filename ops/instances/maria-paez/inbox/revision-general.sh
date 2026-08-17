#!/bin/bash
node -e "
const db=require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB,{readonly:true});
console.log('══ 1. CAMPAÑA: programados ══');
db.prepare(\"SELECT id,cuando,enviado,razon FROM programados WHERE texto LIKE '%Telegram%' ORDER BY cuando\").all().forEach(r=>console.log('#'+r.id,r.cuando.slice(11,16),'enviado:'+r.enviado,r.razon||''));
console.log('══ 2. OUTBOX de hoy ══');
db.prepare(\"SELECT id,creado,estado,intentos,numero,substr(texto,1,42) t,metadata_json m FROM wa_outbox WHERE creado>='2026-08-17' ORDER BY id\").all().forEach(r=>{
  let via=''; try{const mm=JSON.parse(r.m||'{}');via=mm.tipo||mm.via||mm.tag||''}catch{};
  console.log('#'+r.id,r.creado.slice(11,16),r.estado,'int:'+r.intentos,r.numero.slice(-8),via,'|',String(r.t).replace(/\n/g,' '))});
console.log('══ 3. SALIENTES a Diego desde las 12 UTC ══');
db.prepare(\"SELECT timestamp,canal,substr(cuerpo,1,70) c FROM eventos WHERE usuario_id=1 AND direccion='saliente' AND timestamp>='2026-08-17 14:00' ORDER BY id\").all().forEach(r=>console.log(r.timestamp.slice(11,16),r.canal,'|',String(r.c).replace(/\n/g,' ')));
console.log('══ 4. vinculados TG ══');
console.log(db.prepare(\"SELECT COUNT(*) n FROM usuarios WHERE telegram_chat_id IS NOT NULL\").get().n, 'vinculados');
db.close();"
echo "══ 5. MB-FALLO + logs MB tarde ══"
grep "MB-FALLO" ~/.pm2/logs/maria-paez-out.log | tail -6
grep "\[MB " ~/.pm2/logs/maria-paez-out.log | tail -14
echo LISTO
