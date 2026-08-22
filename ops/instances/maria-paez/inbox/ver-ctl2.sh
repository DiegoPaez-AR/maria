#!/bin/bash
cat > /tmp/vc2.cjs <<'JS'
const db=require("/root/secretaria/node_modules/better-sqlite3")(process.env.MARIA_DB,{readonly:true});
db.prepare("SELECT id,cmd,estado,substr(resultado,1,320) r FROM mb_control WHERE id>=4 ORDER BY id").all()
  .forEach(x=>console.log("#"+x.id,x.cmd,"["+x.estado+"] →",(x.r||"(sin resultado)").slice(0,300)));
db.close();
JS
node /tmp/vc2.cjs; rm -f /tmp/vc2.cjs
echo "── polls del teléfono (¿sigue vivo?) ──"
grep "pendiente.txt" /var/log/nginx/intensa.io.access.log | tail -2 | sed -E 's/.*\[([^]]+)\].*/\1/'
echo LISTO
