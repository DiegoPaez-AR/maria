#!/bin/bash
# Destraba a Hernan (user 2): acepta el share de su calendar e insertalo en el
# calendarList de Maria, despues autodetecta el accessRole y lo persiste.
set -uo pipefail
cd /root/secretaria
node -e "
const g=require('./google');
const usuarios=require('./usuarios');
(async()=>{
  const cid='hernan.fulco@sondeosglobal.com';
  console.log('── aceptarCalendarShare('+cid+') ──');
  const r=await g.aceptarCalendarShare(cid);
  console.log(JSON.stringify(r));
  if(!r.ok){ console.log('FALLO — habria que aceptar manual'); process.exit(0); }
  // mapear role -> tier
  const role=r.accessRole;
  let tier='none';
  if(role==='writer'||role==='owner') tier='write';
  else if(role==='reader'||role==='freeBusyReader') tier='read';
  usuarios.setearCalendarAcceso(2, tier);
  console.log('calendar_acceso de Hernan (user 2) =>', tier, '(role='+role+')');
  const u=usuarios.obtener(2);
  console.log('verif DB:', u.calendar_id, u.calendar_acceso);
})().catch(e=>{console.error('ERR:',e.message);process.exit(1);});
"
