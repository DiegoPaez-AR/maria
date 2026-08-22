#!/bin/bash
cd /root/secretaria
echo "── logs [MB] últimos ──"
grep "\[MB" /root/.pm2/logs/maria-paez-out.log | tail -25
echo "── versión publicada ──"; curl -s https://intensa.io/_dl/mariabridge-latest.json; echo
echo "── ping ──"
ID=$(node -e "console.log(require('/root/secretaria/mb-control').encolar('ping'))" | tail -1)
sleep 30
node -e "const db=require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB,{readonly:true});db.prepare('SELECT id,cmd,estado,substr(resultado,1,300) r FROM mb_control ORDER BY id DESC LIMIT 4').all().reverse().forEach(x=>console.log('#'+x.id,x.cmd,'['+x.estado+']',(x.r||'')));db.close();"
echo LISTO
