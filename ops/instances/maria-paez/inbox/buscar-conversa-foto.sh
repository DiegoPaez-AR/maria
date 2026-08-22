#!/bin/bash
cat > /tmp/bcf.cjs <<'JS'
const db=require("/root/secretaria/node_modules/better-sqlite3")(process.env.MARIA_DB,{readonly:true});
console.log("── hecho actual completo ──");
const h=db.prepare(`SELECT clave,valor,creado FROM hechos WHERE clave='maria_sin_foto_perfil_propia'`).get();
console.log(h ? h.creado+" | "+h.valor : "(no está)");
console.log("\n── búsqueda amplia: foto/perfil/avatar/imagen/cara (todo el historial) ──");
db.prepare(`SELECT timestamp,canal,direccion,substr(cuerpo,1,150) c FROM eventos
  WHERE (cuerpo LIKE '%foto de perfil%' OR cuerpo LIKE '%avatar%' OR cuerpo LIKE '%tu cara%' OR cuerpo LIKE '%te ves%'
      OR cuerpo LIKE '%cómo te imaginás%' OR cuerpo LIKE '%como te imaginas%' OR cuerpo LIKE '%elegí%' OR cuerpo LIKE '%elegi %')
    AND cuerpo NOT LIKE '%Subaru%' ORDER BY id LIMIT 25`).all()
  .forEach(x=>console.log(" ",x.timestamp.slice(0,16),x.canal.slice(0,3),x.direccion==='entrante'?'←':'→',String(x.c).replace(/\n/g," ")));
console.log("\n── abril 2026: primeros eventos (arranque de Maria) ──");
db.prepare(`SELECT timestamp,canal,direccion,substr(cuerpo,1,120) c FROM eventos WHERE timestamp LIKE '2026-04%' ORDER BY id LIMIT 15`).all()
  .forEach(x=>console.log(" ",x.timestamp.slice(0,16),x.canal.slice(0,3),x.direccion==='entrante'?'←':'→',String(x.c).replace(/\n/g," ")));
db.close();
JS
node /tmp/bcf.cjs; rm -f /tmp/bcf.cjs
echo LISTO
