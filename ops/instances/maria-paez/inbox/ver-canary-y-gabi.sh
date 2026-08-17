#!/bin/bash
grep -i "canary" /root/secretaria/ops/.cron.log | tail -2
ls /root/secretaria/state/.canary-bad-commit 2>/dev/null && echo "marker sigue" || echo "marker limpio"
node -e "
const db=require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB,{readonly:true});
db.prepare(\"SELECT id,estado,intentos,substr(texto,1,35) t FROM wa_outbox ORDER BY id DESC LIMIT 5\").all().forEach(r=>console.log('#'+r.id,r.estado,'int:'+r.intentos,'|',String(r.t).replace(/\n/g,' ')));
db.close();"
echo LISTO
