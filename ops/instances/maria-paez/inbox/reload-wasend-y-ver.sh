#!/bin/bash
cd /root/secretaria
[ -f state/.canary-bad-commit ] && { echo "CANARY BLOQUEÓ: $(cat state/.canary-bad-commit)"; exit 0; }
pm2 reload ecosystem.config.js --only maria-paez --update-env >/dev/null 2>&1 && echo "reload OK"
echo "── ¿salieron los reenvíos a Gabi? ──"
node -e "
const db=require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB,{readonly:true});
db.prepare(\"SELECT id,estado,intentos,substr(texto,1,40) t FROM wa_outbox ORDER BY id DESC LIMIT 5\").all().forEach(r=>console.log('#'+r.id,r.estado,'int:'+r.intentos,'|',String(r.t).replace(/\n/g,' ')));
db.close();"
grep "\[MB " ~/.pm2/logs/maria-paez-out.log | tail -5
echo LISTO
