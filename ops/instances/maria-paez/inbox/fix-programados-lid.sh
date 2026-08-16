#!/bin/bash
cd /root/secretaria
[ -f state/.canary-bad-commit ] && { echo "CANARY BLOQUEÓ"; exit 0; }
node -e "
const db=require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB);
const rows=db.prepare(\"SELECT id,destino FROM programados WHERE texto LIKE '%Telegram%' AND destino LIKE '%@lid%'\").all();
let n=0;
for (const r of rows) {
  const dig=String(r.destino).replace(/@.*/,'');
  const u=db.prepare(\"SELECT wa_cus FROM usuarios WHERE replace(wa_lid,'@lid','')=?\").get(dig);
  if (u && u.wa_cus) { db.prepare('UPDATE programados SET destino=? WHERE id=?').run(u.wa_cus, r.id); n++; console.log('#'+r.id,'→',u.wa_cus); }
}
console.log('corregidos:',n,'de',rows.length);
db.close();"
pm2 reload ecosystem.config.js --only maria-paez --update-env >/dev/null 2>&1 && echo "reload OK"
echo LISTO
