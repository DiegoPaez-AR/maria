#!/bin/bash
set +e
cd /root/secretaria || exit 1
cat > /tmp/kr.js <<'JS'
const mem=require('/root/secretaria/memory'); const db=mem.db;
const art=(ts)=>{try{return new Date(String(ts).replace(' ','T')+'Z').toLocaleString('es-AR',{timeZone:'America/Argentina/Buenos_Aires',hour12:false});}catch{return ts;}};
const clean=(s)=>String(s==null?'':s).replace(/\s+/g,' ').trim();
console.log('== conversacion Diego (uid=1) ultimos 35 min (con acciones) ==');
for(const e of db.prepare("SELECT timestamp,canal,direccion,nombre,de,cuerpo,metadata_json FROM eventos WHERE usuario_id=1 AND timestamp >= datetime('now','-35 minutes') ORDER BY timestamp ASC").all()){
  if(e.canal==='sistema' && /^claude_call/.test(clean(e.cuerpo))) continue;
  let t=''; try{const m=JSON.parse(e.metadata_json||'{}'); if(m.tag)t=' tag='+m.tag;}catch{}
  console.log('['+art(e.timestamp)+'] '+e.canal+'/'+e.direccion+' '+(e.nombre||e.de||'')+t+' :: '+clean(e.cuerpo).slice(0,420));
}
console.log('\n== contactos candidatos a Kona (por nombre Corner / por digitos / recientes) ==');
const cs=db.prepare("SELECT id,usuario_id,nombre,whatsapp,visibilidad,creado FROM contactos WHERE nombre LIKE '%orner%' OR nombre LIKE '%ona%' OR whatsapp LIKE '%30514423%' OR creado >= '2026-06-16 23:00:00' ORDER BY id DESC LIMIT 20").all();
if(!cs.length) console.log('  (ninguno)');
for(const c of cs) console.log('  id='+c.id+' uid='+c.usuario_id+' "'+c.nombre+'" wa='+JSON.stringify(c.whatsapp)+' vis='+c.visibilidad+' creado='+art(c.creado));
console.log('\n== ultimas acciones upsert_contacto / enviar_wa (sistema) ultimas 40min ==');
for(const s of db.prepare("SELECT timestamp,cuerpo FROM eventos WHERE canal='sistema' AND timestamp >= datetime('now','-40 minutes') AND (cuerpo LIKE '%contacto%' OR cuerpo LIKE '%enviar_wa%' OR cuerpo LIKE '%programar%' OR cuerpo LIKE '%pendiente%') ORDER BY timestamp ASC").all()) console.log('['+art(s.timestamp)+'] '+clean(s.cuerpo).slice(0,200));
JS
node /tmp/kr.js 2>&1; rm -f /tmp/kr.js
