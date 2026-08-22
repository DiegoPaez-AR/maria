#!/bin/bash
cd /root/secretaria
ID=$(node -e "console.log(require('/root/secretaria/mb-control').encolar('shot'))" | tail -1)
echo "shot id=$ID"
for i in 1 2 3 4 5 6 7 8 9 10 11 12; do
  sleep 5
  R=$(node -e "const db=require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB,{readonly:true});const r=db.prepare('SELECT estado,resultado FROM mb_control WHERE id=?').get($ID);db.close();if(r&&r.estado!=='pendiente'&&r.estado!=='enviado')console.log(r.estado+'|'+(r.resultado||''));")
  [ -n "$R" ] && { echo "$R"; break; }
done
URL=$(echo "$R" | grep -oE 'https://[^ ]+\.png')
echo "url=$URL"
if [ -n "$URL" ]; then
  mkdir -p ops/instances/maria-paez/shots
  cp "/var/www/intensa.io/_dl/$(basename "$URL")" ops/instances/maria-paez/shots/ultima.png
  ls -la ops/instances/maria-paez/shots/
fi
echo LISTO
