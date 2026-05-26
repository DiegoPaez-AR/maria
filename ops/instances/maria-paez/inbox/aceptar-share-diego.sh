#!/bin/bash
# Acepta el share del calendar de Diego (diego@paez.is) en el calendarList
# de la cuenta nueva de Maria (maria.paez@intensa.io). Necesario porque entre
# dos Workspaces distintos el share no se auto-añade al calendarList — hay
# que aceptarlo explícitamente (clickear "Add this calendar" o, como hacemos
# acá, vía API con calendarList.insert).
set -euo pipefail
cd /root/secretaria

node -e "
const g = require('./google');
(async () => {
  console.log('── aceptarCalendarShare(diego@paez.is) ──');
  const r = await g.aceptarCalendarShare('diego@paez.is');
  console.log(JSON.stringify(r, null, 2));

  console.log('');
  console.log('── listarCalendarios (post-accept) ──');
  const cals = await g.listarCalendarios();
  console.log('n=' + cals.length);
  for (const c of cals) {
    const star = c.primary ? '★' : ' ';
    console.log(' ' + star + ' ' + c.id + '  (' + c.accessRole + ')  — ' + (c.summary || ''));
  }
})().catch(e => { console.error('ERR:', e.message, e.stack); process.exit(1); });
"
