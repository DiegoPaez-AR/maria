#!/bin/bash
cd /root/secretaria
[ -f state/.canary-bad-commit ] && { echo "CANARY BLOQUEÓ: $(cat state/.canary-bad-commit)"; exit 0; }
pm2 reload ecosystem.config.js --only maria-paez --update-env >/dev/null 2>&1 && echo "reload OK — enviar_wa ahora falla honesto en warm-up"
cat > /tmp/ver.cjs <<'JS'
const db=require("/root/secretaria/node_modules/better-sqlite3")(process.env.MARIA_DB,{readonly:true});
console.log("acciones enviar_wa últimas 2h:");
db.prepare(`SELECT timestamp,substr(cuerpo,1,90) c FROM eventos WHERE canal='sistema' AND timestamp>=datetime('now','-2 hours') AND cuerpo LIKE '%enviar_wa%' ORDER BY id`).all()
  .forEach(x=>console.log(" ",x.timestamp.slice(11,19),String(x.c).replace(/\n/g," ")));
db.close();
JS
node /tmp/ver.cjs; rm -f /tmp/ver.cjs
echo LISTO
