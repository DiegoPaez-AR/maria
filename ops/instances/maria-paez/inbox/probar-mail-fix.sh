#!/bin/bash
cd /root/secretaria
echo "── canary ──"; cat state/.canary-bad-commit 2>/dev/null && echo "⚠️ MALO" || echo "limpio ✓"
grep -n "BUG HISTÓRICO" google.js >/dev/null && echo "fix en disco ✓" || echo "fix NO está"
echo "── mail de prueba a Diego ──"
timeout 60 node -e "
const g=require('/root/secretaria/google');
g.enviarEmail({to:'diego@paez.is', asunto:'Prueba del fix de mails (podés borrarlo)',
  texto:'PRIMERA LÍNEA — si leés esto, el fix funciona.\n\nSegunda línea: antes la primera se perdía como header inválido.\n\nMaria'})
 .then(r=>console.log('  enviado ✓ id', r.id))
 .catch(e=>console.log('  err:', e.message));"
echo LISTO
