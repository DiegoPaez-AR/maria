#!/bin/bash
cd /root/secretaria
ID=$(timeout 15 node -e "console.log(require('/root/secretaria/mb-control').encolar('shot'))" | tail -1)
echo "shot #$ID"
for i in 1 2 3 4 5 6 7 8 9 10; do
  sleep 6
  R=$(timeout 15 node -e "const db=require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB,{readonly:true});const r=db.prepare('SELECT estado,resultado FROM mb_control WHERE id=?').get($ID);db.close();if(r&&r.estado!=='pendiente'&&r.estado!=='enviado')console.log(r.estado+'|'+(r.resultado||''));")
  [ -n "$R" ] && { echo "$R" | cut -c1-120; break; }
done
URL=$(echo "$R" | grep -oE 'https://[^ ]+\.png')
if [ -n "$URL" ]; then
  mkdir -p ops/instances/maria-paez/shots
  cp "/var/www/intensa.io/_dl/$(basename "$URL")" ops/instances/maria-paez/shots/ultima.png && echo "captura copiada ✓"
fi
timeout 15 node -e "console.log(require('/root/secretaria/mb-control').encolar('nodos'))" >/dev/null
sleep 20
timeout 15 node -e "const db=require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB,{readonly:true});db.prepare('SELECT id,cmd,estado,substr(resultado,1,400) r FROM mb_control ORDER BY id DESC LIMIT 2').all().reverse().forEach(x=>console.log(' #'+x.id,x.cmd,'['+x.estado+']',x.r||''));db.close();"
echo LISTO
