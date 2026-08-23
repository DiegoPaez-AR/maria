#!/bin/bash
cd /root/secretaria
enc() { timeout 15 node -e "console.log(require('/root/secretaria/mb-control').encolar('$1'))" >/dev/null; }
echo "── estado AHORA (Diego acaba de usar el teléfono) ──"
enc ping; enc nodos; sleep 30
timeout 15 node -e "const db=require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB,{readonly:true});db.prepare('SELECT id,cmd,estado,substr(resultado,1,200) r FROM mb_control ORDER BY id DESC LIMIT 2').all().reverse().forEach(x=>console.log(' #'+x.id,x.cmd,'['+x.estado+']',x.r||''));db.close();"
echo ""
echo "── logs del barrido de notificaciones (v4.5) ──"
timeout 15 grep -E "\[MB.*(barrido|listener conectado)" /root/.pm2/logs/maria-paez-out.log | tail -8
echo ""
echo "── versión ──"; timeout 15 grep "\[MB v" /root/.pm2/logs/maria-paez-out.log | tail -3
echo LISTO
