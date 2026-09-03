#!/bin/bash
cd /root/secretaria
echo "── canje del code OAuth de sofia@luminaconsultora.com ──"
( set -a; . config/instances/sofia-bruscoli.conf; [ -f config/secrets.conf ] && . config/secrets.conf; set +a
  timeout 60 node auth-gmail.js exchange '4/0ATsMZqC0-Et6rdbpDbtK9sXgIOQpCGSC-ukgzGXUomSmdtcWXeWqufXJlZL1mFhDfsvK2w' 2>&1 | tail -6 )
echo "── token generado? ──"; ls -la state/sofia-bruscoli/ 2>/dev/null | grep -i token
echo "── prueba: ¿la cuenta responde? ──"
( set -a; . config/instances/sofia-bruscoli.conf; [ -f config/secrets.conf ] && . config/secrets.conf; set +a
  timeout 60 node -e "
  (async()=>{ const g=require('/root/secretaria/google'); const auth=await g.autenticar();
    const {google}=require('googleapis'); const gm=google.gmail({version:'v1',auth});
    const p=await gm.users.getProfile({userId:'me'}); console.log('  Gmail OK:', p.data.emailAddress);
    const cal=google.calendar({version:'v3',auth}); const l=await cal.calendarList.list(); console.log('  Calendars:', l.data.items.length);
  })().catch(e=>console.log('  ERR', e.message));" 2>&1 | grep -v Warning )
echo LISTO
