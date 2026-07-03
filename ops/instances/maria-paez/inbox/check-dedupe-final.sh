#!/bin/bash
cd /root/secretaria
grep -E "canary (OK|FALLÓ)" ops/.cron.log | tail -1
env -i PATH="$PATH" HOME=/root TZ=America/Argentina/Buenos_Aires npm test 2>&1 | grep -E "^# (tests|pass|fail)|^not ok"
node -e "
const db = require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB, {readonly:true});
const r = db.prepare(\"SELECT id, nombre FROM contactos WHERE nombre LIKE '%Ward%'\").all();
console.log('Ward en libreta:', JSON.stringify(r));
db.close();
"
echo LISTO
