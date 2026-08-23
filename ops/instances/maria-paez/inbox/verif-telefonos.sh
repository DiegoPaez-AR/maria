#!/bin/bash
cd /root/secretaria
echo "── canary ──"; cat state/.canary-bad-commit 2>/dev/null && echo "⚠️ MALO" || echo "limpio ✓"
git log --oneline -1 | cut -c1-55
timeout 20 pm2 jlist 2>/dev/null | python3 -c "
import json,sys,time
for p in json.load(sys.stdin):
    if p['name']!='maria-paez': continue
    print('  pm2', p['pm2_env']['status'], 'up=%dmin'%((time.time()*1000-p['pm2_env']['pm_uptime'])/60000))"
echo "── tests del módulo ──"
timeout 60 env -u MARIA_DB -u MARIA_VAULT_KEY node --test test/telefonos.test.js 2>&1 | grep -E "^# (tests|pass|fail)"
echo "── casos reales contra la DB viva ──"
timeout 30 node -e "
const tel=require('/root/secretaria/telefonos');
const usuarios=require('/root/secretaria/usuarios'), mem=require('/root/secretaria/memory');
const owner=usuarios.obtenerOwner();
for (const n of ['5491155771290','541155771290','5491134897992','5491140402319']) {
  let nombre='';
  for (const v of tel.variantes(n)) {
    const u=usuarios.resolverPorWa(v+'@c.us'); if(u){nombre=u.nombre+' (usuario)';break;}
    const c=mem.buscarContacto({usuarioId:owner.id,whatsapp:v+'@c.us'}); if(c){nombre=c.nombre;break;}
  }
  console.log('  '+n.padEnd(15),'→', nombre||'(no encontrado)', '| envío:', tel.paraWa(n));
}
console.log('  mismoNumero(Manuel c/9, Manuel s/9):', tel.mismoNumero('5491155771290','541155771290'));
"
echo "── errores ──"; timeout 10 tail -4 /root/.pm2/logs/maria-paez-error.log
echo LISTO
