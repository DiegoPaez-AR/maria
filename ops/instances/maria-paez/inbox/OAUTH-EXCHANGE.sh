#!/bin/bash
cd /root/secretaria && set -a; . config/instances/maria-paez.conf 2>/dev/null; . config/secrets.conf 2>/dev/null; set +a
node auth-gmail.js exchange '4/0AXEQxIBtBk5RIpGq_yQB_Sp5mtVIdexnU3Zb0Ul47Xgre2Y-DsYl5XTwna1c3diQPhBJPw' 2>&1 | tail -3
pm2 reload ecosystem.config.js --only maria-paez --update-env >/dev/null 2>&1
sleep 8
echo "== verificación =="
node -e "
const g = require('/root/secretaria/google');
(async () => {
  await g.autenticar(); console.log('OAuth OK');
  const evs = await g.listarEventosDelUsuario ? 'skip' : null;
  const mails = await g.listarEmailsNoLeidos({ max: 3 }); console.log('Gmail OK,', mails.length, 'no leídos');
})().catch(e => console.log('FALLO:', e.message));
" 2>&1 | tail -3
pm2 jlist | python3 -c "import json,sys; [print(p['name'], p['pm2_env']['status']) for p in json.load(sys.stdin) if p['name']=='maria-paez']"
