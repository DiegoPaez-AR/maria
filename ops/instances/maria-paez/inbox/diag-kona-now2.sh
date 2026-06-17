#!/bin/bash
set +e
cd /root/secretaria || exit 1
cat > /tmp/kn.js <<'JS'
const mem=require('/root/secretaria/memory'); const db=mem.db;
const art=(ts)=>{try{return new Date(String(ts).replace(' ','T')+'Z').toLocaleString('es-AR',{timeZone:'America/Argentina/Buenos_Aires',hour12:false});}catch{return ts;}};
const clean=(s)=>String(s==null?'':s).replace(/\s+/g,' ').trim();
const N='5491130514423';
console.log('== conversacion Diego (uid=1) ultimos 60 min ==');
for(const e of db.prepare("SELECT timestamp,canal,direccion,nombre,de,cuerpo,metadata_json FROM eventos WHERE usuario_id=1 AND timestamp >= datetime('now','-60 minutes') ORDER BY timestamp ASC").all()){
  if(e.canal==='sistema' && /^claude_call/.test(clean(e.cuerpo))) continue;
  let t=''; try{const m=JSON.parse(e.metadata_json||'{}'); if(m.tag)t=' tag='+m.tag;}catch{}
  console.log('['+art(e.timestamp)+'] '+e.canal+'/'+e.direccion+' '+(e.nombre||e.de||'')+t+' :: '+clean(e.cuerpo).slice(0,400));
}
console.log('\n== acciones/eventos con el numero de Kona (ok/fail) ==');
for(const s of db.prepare("SELECT timestamp,canal,direccion,cuerpo FROM eventos WHERE cuerpo LIKE ? OR de LIKE ? ORDER BY timestamp ASC").all('%'+N+'%','%'+N+'%')) console.log('['+art(s.timestamp)+'] '+s.canal+'/'+s.direccion+' :: '+clean(s.cuerpo).slice(0,220));
console.log('\n== contacto Kona por numero ==');
const cc=db.prepare("SELECT id,nombre,whatsapp,visibilidad,creado FROM contactos WHERE whatsapp LIKE ?").all('%'+N+'%');
if(!cc.length) console.log('  (NO hay contacto guardado con ese numero)');
for(const c of cc) console.log('  id='+c.id+' "'+c.nombre+'" wa='+c.whatsapp+' vis='+c.visibilidad);
JS
node /tmp/kn.js 2>&1; rm -f /tmp/kn.js
