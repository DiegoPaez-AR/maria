#!/bin/bash
cd /root/secretaria
echo "== ping"; bash ops/tools/mb-remoto.sh ping | tail -1
echo "== shot (prueba canTakeScreenshot)"; bash ops/tools/mb-remoto.sh shot | tail -2
echo "== encolo frío de prueba al owner"
node -e "
const u=require('./usuarios'); const o=u.obtenerOwner(); const ob=require('./wa-outbox');
const id=ob.encolar({usuarioId:o.id, numero:String(o.wa_cus).replace('@c.us',''), texto:'Prueba v4.8 — envío en frío con verificación. Ignorar.', metadata:{tipo:'test_v48', origen:'ops'}});
console.log('encolado #'+id);"
