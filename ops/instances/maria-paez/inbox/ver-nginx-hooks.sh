#!/bin/bash
echo "── nginx: ruteo de /hooks ──"
grep -rn "hooks" /etc/nginx/sites-enabled/*.conf 2>/dev/null | head -8
echo "── bloque completo del hook ──"
awk '/location.*hooks/,/}/' /etc/nginx/sites-enabled/intensa.io.conf 2>/dev/null | head -15
echo "── instancias en la control DB ──"
node -e "
const db=require('/root/secretaria/node_modules/better-sqlite3')('/root/secretaria/state/_control/intensa.sqlite',{readonly:true});
db.prepare('SELECT slug, internal_port, max_usuarios, signup_bot, estado FROM instances').all().forEach(r=>console.log(JSON.stringify(r)));
db.close();" 2>&1 | head -5
echo "── puertos internal-api en uso ──"
grep -h "ASISTENTE_INTERNAL_PORT" /root/secretaria/config/instances/*.conf 2>/dev/null
echo LISTO
