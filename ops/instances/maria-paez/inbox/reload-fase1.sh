#!/bin/bash
cd /root/secretaria
[ -f state/.canary-bad-commit ] && { echo "CANARY BLOQUEÓ: $(cat state/.canary-bad-commit)"; exit 0; }
pm2 reload ecosystem.config.js --update-env >/dev/null 2>&1 && echo "reload OK"
node -e "require('/root/secretaria/gestion-ajena.js'); console.log('require gestion-ajena OK')"
echo "── usuarios activos NO vinculados a TG ──"
node -e "
const db=require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB,{readonly:true});
const rows=db.prepare(\"SELECT id,nombre,telegram_chat_id FROM usuarios WHERE activo=1 AND (servido IS NULL OR servido=1)\").all();
rows.forEach(r=>console.log(r.id, r.nombre, r.telegram_chat_id?'VINCULADO':'no'));
console.log('total:',rows.length,'| sin vincular:',rows.filter(r=>!r.telegram_chat_id).length);
db.close();"
echo LISTO
