#!/bin/bash
cat > /tmp/ah923.cjs <<'JS'
const db=require("/root/secretaria/node_modules/better-sqlite3")(process.env.MARIA_DB,{readonly:true});
const total=db.prepare("SELECT COUNT(*) n FROM hechos").get().n;
console.log("TOTAL:", total);
console.log("\n=== por usuario ===");
db.prepare("SELECT usuario_id, COUNT(*) n FROM hechos GROUP BY usuario_id").all().forEach(x=>console.log("  u"+x.usuario_id+":",x.n));
try{
  const cols=db.prepare("PRAGMA table_info(usuarios)").all().map(c=>c.name);
  const nc=cols.includes("nombre")?"nombre":cols[1];
  console.log("\n=== usuarios ===");
  db.prepare("SELECT id,"+nc+" AS n FROM usuarios").all().forEach(u=>console.log("  u"+u.id+": "+u.n));
}catch(e){console.log("(usuarios: "+e.message+")");}
console.log("\n=== HECHOS ===");
db.prepare("SELECT id,usuario_id,clave,valor,fuente,creado,actualizado FROM hechos ORDER BY usuario_id,id").all()
 .forEach(x=>console.log(`\n[u${x.usuario_id} #${x.id}] ${x.clave}  creado=${String(x.creado).slice(0,10)} act=${String(x.actualizado||"").slice(0,10)} fuente=${x.fuente}\n   ${String(x.valor).replace(/\n/g," ")}`));
db.close();
JS
node /tmp/ah923.cjs; rm -f /tmp/ah923.cjs
echo LISTO
