#!/bin/bash
set +e
cd /root/secretaria || exit 1
cat > /tmp/dmp.js <<'JS'
const mem=require('/root/secretaria/memory'); const db=mem.db;
const art=(ts)=>{try{return new Date(String(ts).replace(' ','T')+'Z').toLocaleString('es-AR',{timeZone:'America/Argentina/Buenos_Aires',hour12:false});}catch{return ts;}};
console.log('== ultimos avisos meeting-prep que recibio Diego (uid=1) ==');
const rows=db.prepare("SELECT timestamp,cuerpo,metadata_json FROM eventos WHERE usuario_id=1 AND direccion='saliente' AND (cuerpo LIKE '%En 15min%' OR cuerpo LIKE '%En %min%:%' OR cuerpo LIKE '⏰%') ORDER BY timestamp DESC LIMIT 6").all();
console.log(rows.length+' encontrados\n');
for(const r of rows){ console.log('--- '+art(r.timestamp)+' ---'); console.log(r.cuerpo); console.log(''); }
console.log('== tambien busco en programados (razon meeting_prep) los textos ==');
for(const p of db.prepare("SELECT cuando,texto,razon FROM programados WHERE razon LIKE 'meeting_prep:%' ORDER BY id DESC LIMIT 5").all()){ console.log('--- '+art(p.cuando)+' ['+p.razon+'] ---'); console.log(p.texto); console.log(''); }
JS
node /tmp/dmp.js 2>&1; rm -f /tmp/dmp.js
