#!/bin/bash
set +e
cd /root/secretaria || exit 1
cat > /tmp/fkd.js <<'JS'
const mem=require('/root/secretaria/memory'); const db=mem.db;
// 1) Setear el numero al contacto Konā Corner (#321)
const before=db.prepare("SELECT id,nombre,whatsapp FROM contactos WHERE id=321").get();
console.log('antes:', JSON.stringify(before));
if(before){
  db.prepare("UPDATE contactos SET whatsapp=?, actualizado=CURRENT_TIMESTAMP WHERE id=321").run('5491130514423@c.us');
  console.log('despues:', JSON.stringify(db.prepare("SELECT id,nombre,whatsapp FROM contactos WHERE id=321").get()));
} else { console.log('NO existe #321'); }
// 2) Cancelar el pendiente fantasma #164
const p=db.prepare("SELECT id,estado,desc FROM pendientes WHERE id=164").get();
console.log('\npendiente #164 antes:', JSON.stringify(p));
if(p && p.estado==='abierto'){
  db.prepare("UPDATE pendientes SET estado='cancelado', cerrado=CURRENT_TIMESTAMP WHERE id=164").run();
  console.log('pendiente #164 despues:', JSON.stringify(db.prepare("SELECT id,estado FROM pendientes WHERE id=164").get()));
} else { console.log('(#164 no estaba abierto o no existe)'); }
JS
node /tmp/fkd.js 2>&1; rm -f /tmp/fkd.js
