#!/bin/bash
set +e
cd /root/secretaria || exit 1
node -e '
const mem = require("/root/secretaria/memory");
const db = mem.db;
const art = (ts)=>{ try { return new Date(String(ts).replace(" ","T")+"Z").toLocaleString("es-AR",{timeZone:"America/Argentina/Buenos_Aires",hour12:false}); } catch { return ts; } };
const clean = (s)=> String(s==null?"":s).replace(/\s+/g," ").trim();
const N="5491130514423";
console.log("== eventos con el numero de Kona "+N+" ==");
const ev = db.prepare("SELECT timestamp,canal,direccion,de,nombre,cuerpo,metadata_json FROM eventos WHERE de LIKE ? OR cuerpo LIKE ? ORDER BY timestamp ASC").all("%"+N+"%","%"+N+"%");
console.log(ev.length+" eventos");
for (const e of ev){ let t=""; try{const m=JSON.parse(e.metadata_json||"{}"); if(m.tag)t=" tag="+m.tag;}catch{}; console.log("["+art(e.timestamp)+"] "+e.canal+"/"+e.direccion+" de="+(e.de||"")+t+" :: "+clean(e.cuerpo).slice(0,200)); }
console.log("\n== contacto Kona en libreta ==");
for (const x of db.prepare("SELECT id,usuario_id,nombre,whatsapp,creado FROM contactos WHERE nombre LIKE ?").all("%ona%")) console.log("  id="+x.id+" uid="+x.usuario_id+" \""+x.nombre+"\" wa="+x.whatsapp+" creado="+x.creado);
' 2>&1
