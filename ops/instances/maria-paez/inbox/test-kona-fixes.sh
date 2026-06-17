#!/bin/bash
set +e
cd /root/secretaria || exit 1
cat > /tmp/tkf.js <<'JS'
const mem=require('/root/secretaria/memory'); const u=require('/root/secretaria/usuarios');
const { ejecutarAcciones } = require('/root/secretaria/executor');
(async()=>{
  try { require('/root/secretaria/whatsapp-handler'); console.log('[handler] require OK'); } catch(e){ console.log('[handler] require FALLÓ:', e.message); }
  const owner=u.obtenerOwner();
  // FIX#1: upsert con número no verificable (waClient=null) ahora guarda igual
  mem.db.exec('SAVEPOINT t1');
  const r=await ejecutarAcciones([{tipo:'upsert_contacto', nombre:'ZZ_TEST_KONA', whatsapp:'5491130514423'}], {usuario:owner, waClient:null, canalOrigen:'whatsapp'});
  const row=mem.db.prepare("SELECT nombre,whatsapp FROM contactos WHERE nombre='ZZ_TEST_KONA'").get();
  console.log('[fix1 upsert] ok='+(r[0]&&r[0].ok)+' guardado_wa='+(row?JSON.stringify(row.whatsapp):'(no existe)'));
  mem.db.exec('ROLLBACK TO t1'); mem.db.exec('RELEASE t1');
  // verificar contacto Kona real #321
  const k=mem.db.prepare("SELECT id,nombre,whatsapp FROM contactos WHERE id=321").get();
  console.log('[kona #321] '+JSON.stringify(k));
  const p=mem.db.prepare("SELECT id,estado FROM pendientes WHERE id=164").get();
  console.log('[pendiente #164] '+JSON.stringify(p));
  // verificar que las reglas nuevas están en el prompt construido (sin construir todo, grep al fuente ya hecho)
  console.log('[ok] tests corridos');
})().catch(e=>console.log('FATAL',e.message,e.stack));
JS
node /tmp/tkf.js 2>&1; rm -f /tmp/tkf.js
