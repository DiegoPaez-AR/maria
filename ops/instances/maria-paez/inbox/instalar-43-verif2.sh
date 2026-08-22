#!/bin/bash
cd /root/secretaria
node -e "console.log(require('/root/secretaria/mb-control').encolar('nodos'))" >/dev/null
sleep 25
node -e "const db=require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB,{readonly:true});db.prepare('SELECT id,cmd,estado,substr(resultado,1,700) r FROM mb_control ORDER BY id DESC LIMIT 2').all().reverse().forEach(x=>console.log('#'+x.id,x.cmd,'['+x.estado+']',(x.r||'')));db.close();"
echo "── logs ──"
grep "\[MB" /root/.pm2/logs/maria-paez-out.log | tail -12
echo LISTO
