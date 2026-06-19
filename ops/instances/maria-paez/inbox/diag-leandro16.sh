#!/bin/bash
set +e
cd /root/secretaria || exit 1
cat > /tmp/dl.js <<'JS'
const mem=require('/root/secretaria/memory'); const db=mem.db;
const art=(ts)=>{try{return new Date(String(ts).replace(' ','T')+'Z').toLocaleString('es-AR',{timeZone:'America/Argentina/Buenos_Aires',hour12:false});}catch{return ts;}};
const clean=(s)=>String(s==null?'':s).replace(/\s+/g,' ').trim();
// 16/06 16:00-17:00 ART = UTC 19:00-20:00
console.log('=== Diego (uid=1) 16/06 ~16:00-17:00 ART (turno Leandro/dirección) ===');
const rows=db.prepare("SELECT timestamp,canal,direccion,nombre,de,cuerpo,metadata_json FROM eventos WHERE usuario_id=1 AND timestamp BETWEEN '2026-06-16 19:00:00' AND '2026-06-16 20:10:00' ORDER BY timestamp ASC").all();
for(const e of rows){
  const cu=clean(e.cuerpo);
  if(e.canal==='sistema' && /^claude_call/.test(cu)) continue;
  let tag=''; try{const m=JSON.parse(e.metadata_json||'{}'); if(m.tag)tag=' ['+m.tag+']'; if(m.slot)tag+=' {'+m.slot+'}';}catch{}
  const fl=e.direccion==='entrante'?'→':(e.direccion==='saliente'?'←':'·');
  console.log(`[${art(e.timestamp)}] ${fl} ${e.canal} ${e.nombre||e.de||''}${tag}: ${cu.slice(0,400)}`);
}
JS
node /tmp/dl.js 2>&1; rm -f /tmp/dl.js
