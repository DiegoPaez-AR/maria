#!/bin/bash
node -e "const db=require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB,{readonly:true}); const r=db.prepare('SELECT id,estado,intentos FROM wa_outbox ORDER BY id DESC LIMIT 1').get(); console.log('#'+r.id, r.estado, 'int:'+r.intentos); db.close();"
grep "MB-DIAG" ~/.pm2/logs/maria-paez-out.log | tail -2
echo LISTO
