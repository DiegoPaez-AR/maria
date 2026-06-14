#!/bin/bash
set +e
cd /root/secretaria || exit 1
export ART_DAY="$(TZ=America/Argentina/Buenos_Aires date +%F)"
cat > /tmp/diag-ev.js <<'JS'
const mem = require('/root/secretaria/memory');
const db = mem.db;
const DAY = process.env.ART_DAY;
const LO = DAY+' 15:00:00', HI = DAY+' 16:30:00';
const art = (ts)=>{ try { return new Date(String(ts).replace(' ','T')+'Z').toLocaleString('es-AR',{timeZone:'America/Argentina/Buenos_Aires',hour12:false}); } catch { return ts; } };
const clean = (s)=> String(s==null?'':s).replace(/\s+/g,' ').trim();

console.log('=== (1) CONVERSACIÓN DE DIEGO (uid=1) ENTRE 12:00 y 13:30 ART ('+DAY+') ===');
const win = db.prepare("SELECT timestamp,canal,direccion,nombre,de,asunto,cuerpo,metadata_json FROM eventos WHERE usuario_id=1 AND timestamp BETWEEN ? AND ? ORDER BY timestamp ASC").all(LO,HI);
console.log('('+win.length+' eventos)\n');
for (const e of win){
  let meta=''; try{const m=JSON.parse(e.metadata_json||'{}'); if(m.tipo)meta=' tipo='+m.tipo; if(m.tercero)meta+=' [tercero]'; if(m.tag)meta+=' tag='+m.tag;}catch{}
  console.log(`[${art(e.timestamp)} ART] ${e.canal}/${e.direccion} — ${e.nombre||e.de||'?'}${meta}`);
  if(e.asunto) console.log('   ASUNTO: '+clean(e.asunto));
  console.log('   '+clean(e.cuerpo).slice(0,600));
  console.log('');
}

console.log('\n=== (2) TODO LO QUE MENCIONA "EVELIA" HOY (cualquier bucket/canal) ===');
const ev = db.prepare("SELECT timestamp,usuario_id,canal,direccion,nombre,de,asunto,cuerpo FROM eventos WHERE timestamp >= ? AND (cuerpo LIKE '%Evelia%' OR cuerpo LIKE '%evelia%' OR nombre LIKE '%velia%' OR de LIKE '%velia%' OR asunto LIKE '%velia%') ORDER BY timestamp ASC").all(DAY+' 00:00:00');
console.log('('+ev.length+' eventos)\n');
for (const e of ev){
  console.log(`[${art(e.timestamp)} ART] uid=${e.usuario_id} ${e.canal}/${e.direccion} — ${e.nombre||e.de||'?'}`);
  if(e.asunto) console.log('   ASUNTO: '+clean(e.asunto));
  console.log('   '+clean(e.cuerpo).slice(0,600));
  console.log('');
}

console.log('\n=== (3) ÚLTIMOS SALIENTES HACIA DIEGO (uid=1, WA) — últimas 4h ===');
const sal = db.prepare("SELECT timestamp,canal,direccion,cuerpo,metadata_json FROM eventos WHERE usuario_id=1 AND direccion='saliente' AND timestamp >= datetime('now','-4 hours') ORDER BY timestamp DESC LIMIT 12").all();
for (const e of sal){
  let meta=''; try{const m=JSON.parse(e.metadata_json||'{}'); if(m.tipo)meta=' tipo='+m.tipo; if(m.tag)meta+=' tag='+m.tag;}catch{}
  console.log(`[${art(e.timestamp)} ART] ${e.canal}${meta}`);
  console.log('   '+clean(e.cuerpo).slice(0,800));
  console.log('');
}
JS
node /tmp/diag-ev.js 2>&1
rm -f /tmp/diag-ev.js
