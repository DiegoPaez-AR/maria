#!/bin/bash
echo "── log del cron-master (últimas 30 con campana/error) ──"
grep -i "campana\|error\|fail" /root/secretaria/state/cron-master.log 2>/dev/null | tail -10
ls /root/secretaria/state/*.log /var/log/maria-cron* 2>/dev/null | head -4
echo "── ¿quedó el mjs? ──"; ls -la /tmp/campana-tg.mjs 2>/dev/null || echo "no está"
echo "── programados con Telegram AHORA ──"
node -e "
const db=require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB,{readonly:true});
console.log('total:', db.prepare(\"SELECT COUNT(*) n FROM programados WHERE texto LIKE '%Telegram%' AND enviado=0\").get().n);
db.close();"
echo LISTO
