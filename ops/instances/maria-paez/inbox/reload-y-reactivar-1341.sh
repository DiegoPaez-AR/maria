#!/bin/bash
cd /root/secretaria
[ -f state/.canary-bad-commit ] && { echo "CANARY BLOQUEÓ: $(cat state/.canary-bad-commit)"; exit 0; }
pm2 reload ecosystem.config.js --only maria-paez --update-env >/dev/null 2>&1 && echo "reload OK"
# reactivar el #1341 (Fulco) — ver cómo quedó marcado y resetear
node -e "
const db=require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB);
const r=db.prepare('SELECT id,enviado,razon,cuando FROM programados WHERE id=1341').get();
console.log('estado actual #1341:', JSON.stringify(r));
const prox=new Date(Date.now()+3*60*1000).toISOString();
db.prepare(\"UPDATE programados SET enviado=0, razon=NULL, cuando=? WHERE id=1341\").run(prox);
console.log('#1341 reactivado para', prox);
db.close();"
echo LISTO
