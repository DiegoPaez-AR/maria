#!/bin/bash
cd /root/secretaria
echo "── canary ──"; cat state/.canary-bad-commit 2>/dev/null && echo "⚠️ MALO" || echo "limpio ✓"
git log --oneline -1 | cut -c1-50
timeout 20 pm2 jlist 2>/dev/null | python3 -c "
import json,sys,time
for p in json.load(sys.stdin):
    if p['name']!='maria-paez': continue
    print('  pm2', p['pm2_env']['status'], 'up=%dmin'%((time.time()*1000-p['pm2_env']['pm_uptime'])/60000))"
echo "── el runtime usa telefonos.js? ──"
for f in wa-outbox wa-hook gestion-ajena seguridad memory executor wa-validate internal-api usuarios; do
  grep -q telefonos $f.js && echo "  ok $f" || echo "  ✗ $f"
done
echo "── casos reales contra la DB viva ──"
timeout 30 node -e "
const tel=require('/root/secretaria/telefonos');
const usuarios=require('/root/secretaria/usuarios'), mem=require('/root/secretaria/memory');
const owner=usuarios.obtenerOwner();
for (const n of ['5491155771290','541155771290']) {
  let nombre='';
  for (const v of tel.variantes(n)) {
    const u=usuarios.resolverPorWa(v+'@c.us'); if(u){nombre=u.nombre+' (usuario)';break;}
    const c=mem.buscarContacto({usuarioId:owner.id,whatsapp:v+'@c.us'}); if(c){nombre=c.nombre;break;}
  }
  console.log('  '+n.padEnd(15),'→',nombre||'(no encontrado)','| envío:',tel.paraWa(n));
}"
echo LISTO
