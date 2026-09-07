#!/bin/bash
cd /root/secretaria
node -e "
const u=require('./usuarios'); const o=u.obtenerOwner();
const ob=require('./wa-outbox');
const num=String(o.wa_cus).replace('@c.us','');
const id=ob.encolar({usuarioId:o.id, numero:num, texto:'Prueba de envío en frío MariaBridge v4.7 — si ves esto, la verificación positiva funcionó. (Podés ignorarlo)', metadata:{tipo:'test_v47', origen:'ops'}});
console.log('encolado #'+id+' → '+num+' (WA_WARMUP='+(process.env.WA_WARMUP||'0')+')');
"
