#!/bin/bash
set +e
cd /root/secretaria || exit 1
cat > /tmp/diag-kona.js <<'JS'
const mem = require('/root/secretaria/memory');
const db = mem.db;
const art = (ts)=>{ try { return new Date(String(ts).replace(' ','T')+'Z').toLocaleString('es-AR',{timeZone:'America/Argentina/Buenos_Aires',hour12:false}); } catch { return ts; } };
const clean = (s)=> String(s==null?'':s).replace(/\s+/g,' ').trim();

console.log('=== (1) TODO LO QUE MENCIONA "KONA" (últimas 48h, cualquier bucket) ===');
const ev = db.prepare("SELECT timestamp,usuario_id,canal,direccion,nombre,de,asunto,cuerpo,metadata_json FROM eventos WHERE timestamp >= datetime('now','-48 hours') AND (cuerpo LIKE '%kona%' OR cuerpo LIKE '%Kona%' OR nombre LIKE '%ona%' OR asunto LIKE '%kona%') ORDER BY timestamp ASC").all();
console.log('('+ev.length+' eventos)\n');
for (const e of ev){
  let meta=''; try{const m=JSON.parse(e.metadata_json||'{}'); if(m.tipo)meta=' tipo='+m.tipo; if(m.tag)meta+=' tag='+m.tag;}catch{}
  console.log(`[${art(e.timestamp)} ART] uid=${e.usuario_id} ${e.canal}/${e.direccion} — ${e.nombre||e.de||'?'}${meta}`);
  if(e.asunto) console.log('   ASUNTO: '+clean(e.asunto));
  console.log('   '+clean(e.cuerpo).slice(0,700));
  console.log('');
}

console.log('\n=== (2) CONVERSACIÓN DE DIEGO (uid=1) — últimas 3h, contexto completo ===');
const win = db.prepare("SELECT timestamp,canal,direccion,nombre,de,cuerpo,metadata_json FROM eventos WHERE usuario_id=1 AND timestamp >= datetime('now','-3 hours') ORDER BY timestamp ASC").all();
console.log('('+win.length+' eventos)\n');
for (const e of win){
  let meta=''; try{const m=JSON.parse(e.metadata_json||'{}'); if(m.tipo)meta=' tipo='+m.tipo; if(m.tag)meta+=' tag='+m.tag;}catch{}
  // saltear el ruido de los claude_call para que se lea
  if (e.canal==='sistema' && /^claude_call/.test(clean(e.cuerpo))) continue;
  console.log(`[${art(e.timestamp)} ART] ${e.canal}/${e.direccion} — ${e.nombre||e.de||'?'}${meta}`);
  console.log('   '+clean(e.cuerpo).slice(0,700));
  console.log('');
}
JS
node /tmp/diag-kona.js 2>&1
rm -f /tmp/diag-kona.js
