#!/bin/bash
cd /root/secretaria
timeout 20 node -e "const c=require('/root/secretaria/mb-control'); c.encolar('ping'); c.encolar('despertar');"
sleep 30
timeout 20 node -e "const db=require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB,{readonly:true});db.prepare('SELECT id,cmd,estado,substr(resultado,1,120) r FROM mb_control ORDER BY id DESC LIMIT 3').all().reverse().forEach(x=>console.log(' #'+x.id,x.cmd,'['+x.estado+']',x.r||''));db.close();"
echo "── logs de la app ──"; timeout 10 grep "\[MB" /root/.pm2/logs/maria-paez-out.log | tail -6
echo LISTO
