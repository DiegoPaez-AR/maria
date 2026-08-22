#!/bin/bash
cat > /tmp/ah.cjs <<'JS'
const db=require("/root/secretaria/node_modules/better-sqlite3")(process.env.MARIA_DB,{readonly:true});
const cols=db.prepare("PRAGMA table_info(hechos)").all().map(c=>c.name);
console.log("columnas:", cols.join(","));
const total=db.prepare("SELECT COUNT(*) n FROM hechos").get().n;
console.log("TOTAL de hechos:", total);
console.log("\n═══ por usuario ═══");
db.prepare(`SELECT usuario_id, COUNT(*) n FROM hechos GROUP BY usuario_id`).all().forEach(x=>console.log("  u"+x.usuario_id+":",x.n));
console.log("\n═══ TODOS los hechos (clave + valor recortado) ═══");
db.prepare(`SELECT id,usuario_id,clave,substr(valor,1,220) v,creado FROM hechos ORDER BY usuario_id, id`).all()
  .forEach(x=>console.log(`\n[u${x.usuario_id} #${x.id}] ${x.clave}  (${String(x.creado).slice(0,10)})\n   ${String(x.v).replace(/\n/g," ")}`));
db.close();
JS
node /tmp/ah.cjs; rm -f /tmp/ah.cjs
echo LISTO
