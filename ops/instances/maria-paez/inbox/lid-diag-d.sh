#!/bin/bash
node -e "
const db=require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB);
const rows=db.prepare(\"SELECT id,destino FROM programados WHERE texto LIKE '%Telegram%' ORDER BY cuando\").all();
for (const r of rows) {
  const dig=String(r.destino).replace(/@.*/,'');
  const u=db.prepare(\"SELECT nombre,wa_cus,wa_lid FROM usuarios WHERE wa_cus LIKE '%'||?||'%' OR wa_lid LIKE '%'||?||'%'\").get(dig,dig);
  console.log('#'+r.id, r.destino.slice(0,26), '→', u?u.nombre:'???', u?('cus:'+String(u.wa_cus).slice(0,20)+' lid:'+String(u.wa_lid||'').slice(0,20)):'');
}
db.close();"
echo LISTO
