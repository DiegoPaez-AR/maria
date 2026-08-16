#!/bin/bash
cd /root/secretaria
node -e "
const db=require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB);
const r=db.prepare(\"UPDATE wa_outbox SET estado='cancelado' WHERE id=42 AND estado='pendiente'\").run();
console.log('#42 cancelado:', r.changes);
db.close();"
echo LISTO
