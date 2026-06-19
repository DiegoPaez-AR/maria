#!/bin/bash
set +e
cd /root/secretaria || exit 1
export DIA="$(TZ=America/Argentina/Buenos_Aires date +%F)"
export AHORA="$(TZ=America/Argentina/Buenos_Aires date '+%F %H:%M')"
cat > /tmp/dm.js <<'JS'
const mem=require('/root/secretaria/memory'); const db=mem.db;
const DIA=process.env.DIA;
const art=(ts)=>{try{return new Date(String(ts).replace(' ','T')+'Z').toLocaleString('es-AR',{timeZone:'America/Argentina/Buenos_Aires',hour12:false});}catch{return ts;}};
const clean=(s)=>String(s==null?'':s).replace(/\s+/g,' ').trim();
// Ventana: hoy 00:00 ART a ahora. timestamps en UTC → ART hoy 00:00 = UTC hoy 03:00.
const LO = DIA+' 03:00:00';
console.log('Hoy ART:', DIA, '| ahora:', process.env.AHORA, '| ventana UTC desde', LO, '\n');
const rows=db.prepare("SELECT timestamp,canal,direccion,nombre,de,cuerpo,metadata_json FROM eventos WHERE usuario_id=1 AND timestamp >= ? ORDER BY timestamp ASC").all(LO);
let nClaude=0, msMax=0, msSum=0, nCalls=0, costSum=0, fallos=0;
for(const e of rows){
  const cu=clean(e.cuerpo);
  if(e.canal==='sistema'){
    const m=cu.match(/^claude_call\s+\S+:\s*(\d+)\s*ms.*?\$([0-9.]+)?/);
    if(m){ nCalls++; const ms=+m[1]; msSum+=ms; if(ms>msMax)msMax=ms; if(m[2])costSum+=parseFloat(m[2]); continue; }
    if(/acción FALLÓ/.test(cu)){ fallos++; console.log(`   [${art(e.timestamp)}] ⚠ ${cu.slice(0,160)}`); continue; }
    if(/^acción ejecutada/.test(cu)){ console.log(`   [${art(e.timestamp)}] ✓ ${cu.slice(0,120)}`); continue; }
    if(/^razonamiento/.test(cu)) continue;
    console.log(`   [${art(e.timestamp)}] · ${cu.slice(0,160)}`); continue;
  }
  let tag=''; try{const mm=JSON.parse(e.metadata_json||'{}'); if(mm.tag)tag=' ['+mm.tag+']'; if(mm.slot)tag+=' {'+mm.slot+'}';}catch{}
  const fl = e.direccion==='entrante'?'→':(e.direccion==='saliente'?'←':'·');
  console.log(`[${art(e.timestamp)}] ${fl} ${e.canal} ${e.nombre||e.de||''}${tag}: ${cu.slice(0,500)}`);
}
console.log(`\n=== métricas mañana: ${nCalls} claude_calls · prom ${nCalls?Math.round(msSum/nCalls):0}ms · max ${msMax}ms · gasto $${costSum.toFixed(2)} · acciones fallidas: ${fallos} ===`);
JS
node /tmp/dm.js 2>&1; rm -f /tmp/dm.js
