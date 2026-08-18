#!/bin/bash
cat > /tmp/pd.cjs <<'JS'
const db=require("/root/secretaria/node_modules/better-sqlite3")(process.env.MARIA_DB);
const r=db.prepare(`UPDATE programados SET enviado=-2, razon='pausado-emergencia-18-8' WHERE id BETWEEN 1368 AND 1374`).run();
console.log("UPDATE changes:", r.changes);
db.prepare(`SELECT id,enviado,razon FROM programados WHERE id BETWEEN 1368 AND 1374`).all().forEach(x=>console.log(JSON.stringify(x)));
db.close();
JS
node /tmp/pd.cjs; rm -f /tmp/pd.cjs
echo LISTO
