#!/bin/bash
CONF=/root/secretaria/config/instances/maria-paez.conf
grep -q "^WA_SALIENTE_OFF=" "$CONF" || { echo "" >> "$CONF"; echo "# 18/8: cuenta en revisión — TODO saliente WA apagado (sacar esta línea para reactivar)" >> "$CONF"; echo "WA_SALIENTE_OFF=1" >> "$CONF"; }
cd /root/secretaria
pm2 reload ecosystem.config.js --only maria-paez --update-env >/dev/null 2>&1 && echo "reload OK — WA saliente APAGADO"
node -e "
const db=require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB,{readonly:true});
console.log('outbox pendientes:', db.prepare(\"SELECT COUNT(*) n FROM wa_outbox WHERE estado='pendiente'\").get().n);
console.log('programados activos hoy/mañana:', db.prepare(\"SELECT COUNT(*) n FROM programados WHERE enviado=0 AND cuando<=datetime('now','+36 hours')\").get().n);
db.close();"
echo LISTO
