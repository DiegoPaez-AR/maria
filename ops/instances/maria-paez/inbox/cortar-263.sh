#!/bin/bash
cd /root/secretaria
node -e "
const mem=require('./memory');
const r=mem.db.prepare(\"UPDATE wa_outbox SET estado='entregado', entregado=CURRENT_TIMESTAMP WHERE id=263 AND estado='pendiente'\").run();
console.log('263 cerrado:', r.changes);
console.log(JSON.stringify(mem.db.prepare('SELECT id,estado,intentos,metadata_json FROM wa_outbox WHERE id>=262').all()));
"
