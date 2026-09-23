#!/bin/bash
cat > /tmp/av923.cjs <<'JS'
const db=require("/root/secretaria/node_modules/better-sqlite3")(process.env.MARIA_DB,{readonly:true});
const q=(s,...p)=>{try{return db.prepare(s).all(...p)}catch(e){return [{err:e.message}]}};
console.log("=== u5 Santiago Bignone: ultimos 10 eventos ===");
q("SELECT timestamp,canal,direccion,substr(cuerpo,1,160) c FROM eventos WHERE usuario_id=5 ORDER BY timestamp DESC LIMIT 10").forEach(r=>console.log(JSON.stringify(r)));
console.log("\n=== u5: menciones agenda/brief/reactivar ===");
q("SELECT timestamp,direccion,substr(cuerpo,1,200) c FROM eventos WHERE usuario_id=5 AND (cuerpo LIKE '%agenda%' OR cuerpo LIKE '%brief%' OR cuerpo LIKE '%notific%') ORDER BY timestamp DESC LIMIT 8").forEach(r=>console.log(JSON.stringify(r)));
console.log("\n=== FICO / cena 2/9 ===");
q("SELECT timestamp,usuario_id,canal,substr(cuerpo,1,180) c FROM eventos WHERE cuerpo LIKE '%FICO%' ORDER BY timestamp DESC LIMIT 6").forEach(r=>console.log(JSON.stringify(r)));
console.log("\n=== Dimitrije ===");
q("SELECT timestamp,usuario_id,canal,substr(cuerpo,1,180) c FROM eventos WHERE cuerpo LIKE '%Dimitrije%' OR cuerpo LIKE '%Krunic%' ORDER BY timestamp DESC LIMIT 6").forEach(r=>console.log(JSON.stringify(r)));
console.log("\n=== ultima actividad por usuario ===");
q("SELECT usuario_id, MAX(timestamp) ult, COUNT(*) n FROM eventos GROUP BY usuario_id ORDER BY ult DESC").forEach(r=>console.log(JSON.stringify(r)));
console.log("\n=== eventos que mencionan UTC (u1, desde jun) ===");
q("SELECT timestamp,direccion,substr(cuerpo,1,200) c FROM eventos WHERE usuario_id=1 AND cuerpo LIKE '%UTC%' AND timestamp>'2026-06-01' ORDER BY timestamp DESC LIMIT 6").forEach(r=>console.log(JSON.stringify(r)));
console.log("\n=== menciones de horario/medianoche/silencio u1 desde ago ===");
q("SELECT timestamp,direccion,substr(cuerpo,1,200) c FROM eventos WHERE usuario_id=1 AND timestamp>'2026-08-01' AND (cuerpo LIKE '%23hs%' OR cuerpo LIKE '%madrugada%' OR cuerpo LIKE '%hora de mandar%' OR cuerpo LIKE '%silencio%') ORDER BY timestamp DESC LIMIT 8").forEach(r=>console.log(JSON.stringify(r)));
db.close();
JS
node /tmp/av923.cjs; rm -f /tmp/av923.cjs
echo LISTO
