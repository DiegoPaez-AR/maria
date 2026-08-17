#!/bin/bash
set -uo pipefail
export PATH="/usr/local/bin:/usr/bin:/bin:${PATH:-}"
cd /root/secretaria
echo "=== REPORTE CAMPANA v3 - $(date '+%Y-%m-%d %H:%M:%S %z') ==="
cat > /tmp/rep3.js <<'JSEOF'
const Database = require("/root/secretaria/node_modules/better-sqlite3");
const db = new Database(process.env.MARIA_DB, { readonly: true });
const q=(s)=>{try{return db.prepare(s).all()}catch(e){console.log(" ERR:"+e.message);return[]}};
const cut=(s,n)=>(s==null?"":String(s).replace(/\s+/g," ").slice(0,n));

console.log("-- ENTRANTES REALES (wa/tg) ultimas 36h --");
const ent=q("SELECT timestamp,canal,de,nombre,usuario_id,cuerpo FROM eventos WHERE direccion='entrante' AND canal IN ('whatsapp','telegram') AND datetime(timestamp)>=datetime('now','-36 hours') ORDER BY timestamp");
console.log("   total: "+ent.length);
for(const e of ent){
  console.log("   "+e.timestamp+" ["+e.canal+"] de="+e.de+" ("+(e.nombre||"-")+") u="+e.usuario_id);
  console.log("      "+cut(e.cuerpo,160));
}
console.log();
console.log("-- ENTRANTES gmail 36h (por si contestaron por mail) --");
const g=q("SELECT timestamp,de,nombre,usuario_id,asunto,cuerpo FROM eventos WHERE direccion='entrante' AND canal='gmail' AND datetime(timestamp)>=datetime('now','-36 hours') ORDER BY timestamp");
console.log("   total: "+g.length);
for(const e of g) console.log("   "+e.timestamp+" de="+e.de+" ["+cut(e.asunto,50)+"] :: "+cut(e.cuerpo,90));
console.log();
console.log("-- TELEGRAM: cualquier evento canal=telegram 36h --");
const t=q("SELECT timestamp,direccion,de,nombre,usuario_id,cuerpo FROM eventos WHERE canal='telegram' AND datetime(timestamp)>=datetime('now','-36 hours') ORDER BY timestamp");
const noDiego=t.filter(e=>String(e.de||"")!=="telegram:590589920");
console.log("   total tg: "+t.length+"   de NO-Diego: "+noDiego.length);
for(const e of noDiego) console.log("   "+e.timestamp+" "+e.direccion+" de="+e.de+" ("+(e.nombre||"-")+") :: "+cut(e.cuerpo,120));
db.close();
JSEOF
node /tmp/rep3.js 2>&1
echo
echo "-- MB: desvios / titulo vacio / restriccion --"
grep -iE "titulo|título|desvi|no encontr|restring|fallo|error|timeout|reintent" ~/.pm2/logs/maria-paez-out.log 2>/dev/null | grep "2026-08-17" | tail -40
echo
echo "-- MB: todas las lineas frio de hoy --"
grep "\[frio\]" ~/.pm2/logs/maria-paez-out.log 2>/dev/null | grep "2026-08-17" | tail -60
echo done
