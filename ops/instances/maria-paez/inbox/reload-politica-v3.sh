#!/bin/bash
cd /root/secretaria
[ -f state/.canary-bad-commit ] && { echo "CANARY BLOQUEÓ: $(cat state/.canary-bad-commit)"; exit 0; }
pm2 reload ecosystem.config.js --only maria-paez --update-env >/dev/null 2>&1 && echo "reload OK — WA ruta principal ACTIVA"
node -e "require('/root/secretaria/wa-send.js'); console.log('require wa-send OK')" 2>&1 | tail -1
echo "── campaña al día ──"
node -e "
const db=require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB,{readonly:true});
db.prepare(\"SELECT id,cuando,enviado FROM programados WHERE texto LIKE '%Telegram%' ORDER BY cuando LIMIT 4\").all().forEach(r=>console.log('#'+r.id,r.cuando.slice(11,16),'UTC',r.enviado===1?'ENVIADO ✓':(r.enviado===0?'pendiente':'estado:'+r.enviado)));
db.close();"
echo LISTO
