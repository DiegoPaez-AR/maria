#!/bin/bash
cd /root/secretaria
enc() { timeout 15 node -e "console.log(require('/root/secretaria/mb-control').encolar('$1'${2:+,$2}))" >/dev/null; }
echo "── despierto, abro la app y toco Buscar actualización ──"
enc despertar; sleep 12
enc home; sleep 12
enc tap '{x:446,y:816}'; sleep 15
enc tap '{x:360,y:883}'
echo "esperando el auto-instalador (v4.4 tiene el plan B geométrico)…"
sleep 90
timeout 15 node -e "console.log(require('/root/secretaria/mb-control').encolar('ping'))" >/dev/null
sleep 25
timeout 20 node -e "const db=require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB,{readonly:true});db.prepare('SELECT id,cmd,estado,substr(resultado,1,90) r FROM mb_control ORDER BY id DESC LIMIT 6').all().reverse().forEach(x=>console.log(' #'+x.id,x.cmd,'['+x.estado+']',x.r||''));db.close();"
echo "── logs del updater ──"
timeout 15 grep "\[MB" /root/.pm2/logs/maria-paez-out.log | tail -14
echo LISTO
