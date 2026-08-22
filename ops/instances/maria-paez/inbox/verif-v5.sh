#!/bin/bash
cd /root/secretaria
echo "── canary ──"; git log --oneline -1 | cut -c1-60
cat state/.canary-bad-commit 2>/dev/null && echo "⚠️ MALO" || echo "limpio ✓"
echo "── ¿Nati resuelve a usuaria? ──"
timeout 20 node -e "
const us=require('/root/secretaria/usuarios');
const u=us.resolverPorWa('5491150105262');
console.log('  →', u? u.nombre+' activo='+u.activo+' tg='+(u.telegram_chat_id?'sí':'no')+' mail='+(u.email||'-') : 'NO es usuario');"
echo "── simulacro: enviar_wa a Nati (debe rutear, NO encolar WA) ──"
timeout 60 node -e "
const {ejecutarAcciones}=require('/root/secretaria/executor');
const u=require('/root/secretaria/usuarios').obtenerOwner();
ejecutarAcciones([{tipo:'enviar_wa',a:'5491150105262',texto:'Prueba interna de ruteo, ignorá este mensaje por favor.'}],{usuario:u,waClient:null,canalOrigen:'telegram'})
 .then(r=>console.log('  resultado:', JSON.stringify(r[0]).slice(0,400)))
 .catch(e=>console.log('  err:', e.message));"
echo "── logs ──"; timeout 15 grep -E "enviar_wa/usuario|politica_v5|wa-outbox.*encolado" /root/.pm2/logs/maria-paez-out.log | tail -5
echo LISTO
