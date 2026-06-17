#!/bin/bash
set +e
cd /root/secretaria || exit 1
node -e '
const mem=require("/root/secretaria/memory"); const db=mem.db;
const art=(ts)=>{try{return new Date(String(ts).replace(" ","T")+"Z").toLocaleString("es-AR",{timeZone:"America/Argentina/Buenos_Aires",hour12:false});}catch{return ts;}};
const clean=(s)=>String(s==null?"":s).replace(/\s+/g," ").trim();
const N="5491130514423";
console.log("== conversacion Diego (uid=1) ultimos 50 min ==");
for(const e of db.prepare("SELECT timestamp,canal,direccion,nombre,de,cuerpo,metadata_json FROM eventos WHERE usuario_id=1 AND timestamp >= datetime(\"now\",\"-50 minutes\") ORDER BY timestamp ASC").all()){
  if(e.canal==="sistema" && /^claude_call/.test(clean(e.cuerpo))) continue;
  let t=""; try{const m=JSON.parse(e.metadata_json||"{}"); if(m.tag)t=" tag="+m.tag;}catch{}
  console.log("["+art(e.timestamp)+"] "+e.canal+"/"+e.direccion+" "+(e.nombre||e.de||"")+t+" :: "+clean(e.cuerpo).slice(0,400));
}
console.log("\n== TODAS las acciones enviar_wa hacia Kona (ok o fail) ==");
for(const s of db.prepare("SELECT timestamp,cuerpo FROM eventos WHERE canal=\"sistema\" AND cuerpo LIKE ? ORDER BY timestamp ASC").all("%"+N+"%")) console.log("["+art(s.timestamp)+"] "+clean(s.cuerpo).slice(0,200));
console.log("\n== contacto Kona por numero ==");
for(const c of db.prepare("SELECT id,nombre,whatsapp,visibilidad,creado FROM contactos WHERE whatsapp LIKE ?").all("%"+N+"%")) console.log("  id="+c.id+" \""+c.nombre+"\" wa="+c.whatsapp+" vis="+c.visibilidad+" creado="+art(c.creado));
console.log("(si no aparece arriba, el contacto NO quedo guardado con ese numero)");
' 2>&1
