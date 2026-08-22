#!/bin/bash
cd /root/secretaria
echo "── HEAD / canary ──"; git log --oneline -1 | cut -c1-80
cat state/.canary-bad-commit 2>/dev/null && echo "⚠️ CANARY MALO" || echo "canary limpio ✓"
timeout 20 pm2 jlist 2>/dev/null | python3 -c "
import json,sys,time
for p in json.load(sys.stdin):
    if p['name']!='maria-paez': continue
    e=p['pm2_env']; print('  pm2 up=%dmin status=%s'%((time.time()*1000-e['pm_uptime'])/60000, e['status']))"
echo "── huérfanos ──"; timeout 30 node ops/tools/huerfanos.js /root/secretaria/*.js
echo "── el guard rechaza placeholder ──"
timeout 40 node -e "
const {ejecutarAcciones}=require('/root/secretaria/executor');
const u=require('/root/secretaria/usuarios').obtenerOwner();
ejecutarAcciones([{tipo:'enviar_wa',a:'5491150105262',texto:'placeholder'}],{usuario:u,waClient:null,canalOrigen:'telegram'})
 .then(r=>console.log('  →', r[0].ok?'❌ PASÓ (mal)':'✓ rechazado: '+String(r[0].error).slice(0,80)))
 .catch(e=>console.log('  err:', e.message));"
echo "── errores recientes ──"; timeout 10 tail -5 /root/.pm2/logs/maria-paez-error.log
echo LISTO
