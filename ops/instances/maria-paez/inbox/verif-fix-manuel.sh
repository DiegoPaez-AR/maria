#!/bin/bash
cd /root/secretaria
echo "── canary ──"; cat state/.canary-bad-commit 2>/dev/null && echo "⚠️ MALO" || echo "limpio ✓"
git log --oneline -1 | cut -c1-55
echo "── nombre de Manuel por ambas variantes ──"
timeout 25 node -e "
const usuarios=require('/root/secretaria/usuarios'), mem=require('/root/secretaria/memory');
const owner=usuarios.obtenerOwner();
for (const dig of ['5491155771290','541155771290']) {
  const cands=[dig];
  if (/^549[0-9]{10}\$/.test(dig)) cands.push('54'+dig.slice(3));
  else if (/^54[0-9]{10}\$/.test(dig)) cands.push('549'+dig.slice(2));
  let nombre='';
  for (const c of cands) {
    const u=usuarios.resolverPorWa(c+'@c.us'); if (u){nombre=u.nombre;break;}
    const ct=owner?mem.buscarContacto({usuarioId:owner.id,whatsapp:c+'@c.us'}):null;
    if (ct){nombre=ct.nombre;break;}
  }
  console.log('  '+dig+' -> ', nombre || '(VACIO x)');
}"
echo "── cruce de canales ──"
timeout 25 node -e "
const mem=require('/root/secretaria/memory');
console.log('  huboRespuesta(WA de Manuel) =', mem.huboRespuesta({usuarioId:1, esperandoDe:'541155771290@c.us', esperandoCanal:'whatsapp', desde:'2026-08-18 00:00:00'}));"
echo LISTO
