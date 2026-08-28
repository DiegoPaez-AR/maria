#!/bin/bash
cd /root/secretaria
echo "── ¿tenemos el WA de Ruben Ward? ──"
timeout 20 node -e "
const mem=require('/root/secretaria/memory');
mem.db.prepare(\"SELECT id,usuario_id,nombre,whatsapp,email,visibilidad FROM contactos WHERE nombre LIKE '%Ward%' OR email LIKE '%ward%'\").all().forEach(c=>console.log(' ',JSON.stringify(c)));"
echo ""
echo "── agenda de Diego, semana próxima (mañanas) ──"
timeout 60 node -e "
(async()=>{
  const g=require('/root/secretaria/google');
  const u=require('/root/secretaria/usuarios').obtenerOwner();
  const desde=new Date('2026-08-31T00:00:00-03:00'), hasta=new Date('2026-09-05T00:00:00-03:00');
  const fn=g.listarEventosCalendario||g.eventosEntre||g.listarEventos||null;
  if(!fn){ console.log('  API distinta — pruebo agenda del prompt-builder'); 
    const pb=require('/root/secretaria/prompt-builder');
    const a=await pb.seccionAgenda(u,{dias:8});
    console.log(a.split('\n').filter(l=>/lun|mar|mié|jue|vie|31\/|01\/|02\/|03\/|04\/|09-0/i.test(l)).slice(0,30).join('\n'));
    return; }
  const evs=await fn.call(g,{usuario:u,desde,hasta});
  for(const e of evs||[]) console.log(' ',e.start?.dateTime||e.start?.date, (e.summary||'').slice(0,50));
})().catch(e=>console.log('ERR',e.message));" 2>&1 | grep -v Warning
echo LISTO
