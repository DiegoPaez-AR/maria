#!/bin/bash
echo "── pendiente #39 (debería estar 'entregado' si matcheó) ──"
node -e "const db=require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB,{readonly:true}); const r=db.prepare('SELECT id,estado,intentos FROM wa_outbox WHERE id=39').get(); console.log('#39', r?r.estado:'?', 'int:'+(r?r.intentos:'?')); db.close();"
echo "── últimos mbdiag (¿chats_vivos ya tiene algo?) ──"
grep "MB-DIAG" ~/.pm2/logs/maria-paez-out.log | tail -3
echo "── confirmaciones nuevas de MariaBridge ──"
grep -E "wa-maria.*confirmar" /var/log/nginx/intensa.io.access.log | tail -3 | sed -E 's/.*\[([^]]+)\].*confirmar\/([0-9]+).*/\1 confirmó #\2/'
echo LISTO
