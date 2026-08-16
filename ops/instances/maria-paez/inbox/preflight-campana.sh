#!/bin/bash
echo "── 1. programados de la campaña ──"
node -e "
const db=require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB,{readonly:true});
const rows=db.prepare(\"SELECT id,cuando,substr(destino,1,18) d,enviado FROM programados WHERE texto LIKE '%Telegram%' ORDER BY cuando\").all();
rows.forEach(r=>console.log('#'+r.id,r.cuando,r.d,r.enviado?'YA ENVIADO?!':'pendiente'));
console.log('total:',rows.length,'(esperado 14)');
db.close();"
echo "── 2. bridge en línea (polls último minuto) ──"
grep "pendiente.txt" /var/log/nginx/intensa.io.access.log | tail -3 | sed -E 's/.*\[([^]]+)\].*/\1/'
echo "── 3. cola outbox limpia ──"
node -e "
const db=require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB,{readonly:true});
console.log('pendientes en outbox:', db.prepare(\"SELECT COUNT(*) n FROM wa_outbox WHERE estado='pendiente'\").get().n);
db.close();"
echo "── 4. últimos logs MB ──"
grep "\[MB " ~/.pm2/logs/maria-paez-out.log | tail -3
echo LISTO
