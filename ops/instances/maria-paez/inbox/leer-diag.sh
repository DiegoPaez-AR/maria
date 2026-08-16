#!/bin/bash
echo "── ¿mensaje entregado? ──"
node -e "const db=require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB,{readonly:true}); const r=db.prepare('SELECT id,estado,intentos FROM wa_outbox ORDER BY id DESC LIMIT 1').get(); console.log('#'+r.id, r.estado, 'int:'+r.intentos); db.close();"
echo "── diagnóstico mbdiag (si no matcheó) ──"
grep "MB-DIAG" ~/.pm2/logs/maria-paez-out.log | tail -3
node -e "const db=require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB,{readonly:true}); db.prepare(\"SELECT timestamp,substr(cuerpo,1,220) c FROM eventos WHERE tipo='mbdiag' ORDER BY id DESC LIMIT 2\").all().forEach(r=>console.log(r.timestamp.slice(11),'|',r.c)); db.close();"
echo LISTO
