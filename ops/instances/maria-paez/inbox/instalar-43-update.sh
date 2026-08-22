#!/bin/bash
cd /root/secretaria
node -e "const db=require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB,{readonly:true});db.prepare('SELECT id,cmd,estado,substr(resultado,1,300) r FROM mb_control ORDER BY id DESC LIMIT 3').all().reverse().forEach(x=>console.log('#'+x.id,x.cmd,'['+x.estado+']',(x.r||'')));db.close();"
echo "── tap Update (espejo de Cancel 213,932) ──"
ID=$(node -e "console.log(require('/root/secretaria/mb-control').encolar('tap',{x:507,y:932}))" | tail -1)
sleep 20
node -e "console.log(require('/root/secretaria/mb-control').encolar('nodos'))" >/dev/null
sleep 25
node -e "const db=require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB,{readonly:true});db.prepare('SELECT id,cmd,estado,substr(resultado,1,600) r FROM mb_control ORDER BY id DESC LIMIT 3').all().reverse().forEach(x=>console.log('#'+x.id,x.cmd,'['+x.estado+']',(x.r||'')));db.close();"
echo LISTO
