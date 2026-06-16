#!/bin/bash
set +e
cd /root/secretaria || exit 1
cat > /tmp/diag-kona2.js <<'JS'
const mem = require('/root/secretaria/memory');
const db = mem.db;
const art = (ts)=>{ try { return new Date(String(ts).replace(' ','T')+'Z').toLocaleString('es-AR',{timeZone:'America/Argentina/Buenos_Aires',hour12:false}); } catch { return ts; } };
const clean = (s)=> String(s==null?'':s).replace(/\s+/g,' ').trim();
const N='5491130514423';

console.log('=== ¿algún evento (entrante/saliente) con el número de Kona '+N+'? ===');
const ev = db.prepare("SELECT timestamp,canal,direccion,de,nombre,cuerpo,metadata_json FROM eventos WHERE de LIKE ? OR cuerpo LIKE ? ORDER BY timestamp ASC").all('%'+N+'%','%'+N+'%');
console.log('('+ev.length+' eventos)\n');
for (const e of ev){
  let meta=''; try{const m=JSON.parse(e.metadata_json||'{}'); if(m.tag)meta=' tag='+m.tag; if(m.tipo)meta+=' tipo='+m.tipo;}catch{}
  console.log(`[${art(e.timestamp)}] ${e.canal}/${e.direccion} de=${e.de||''} ${e.nombre||''}${meta}`);
  console.log('   '+clean(e.cuerpo).slice(0,300));
}

console.log('\n=== contacto Kona en la libreta de Diego (uid=1) ===');
const c = db.prepare("SELECT id,usuario_id,nombre,whatsapp,visibilidad,creado FROM contactos WHERE nombre LIKE '%ona%' OR whatsapp LIKE ?").all('%'+N+'%');
for (const x of c) console.log(`  id=${x.id} uid=${x.usuario_id} "${x.nombre}" wa=${x.whatsapp} vis=${x.visibilidad} creado=${x.creado}`);

console.log('\n=== acciones enviar_wa (ok/fail) hacia Kona, en eventos sistema ===');
const sis = db.prepare("SELECT timestamp,cuerpo FROM eventos WHERE canal='sistema' AND cuerpo LIKE ? ORDER BY timestamp ASC").all('%'+N+'%');
for (const s of sis) console.log(`  [${art(s.timestamp)}] ${clean(s.cuerpo).slice(0,200)}`);
JS
node /tmp/diag-kona2.js 2>&1
rm -f /tmp/diag-kona2.js
