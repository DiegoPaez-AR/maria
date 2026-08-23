#!/bin/bash
cd /root/secretaria
echo "── canary ──"; cat state/.canary-bad-commit 2>/dev/null && echo "⚠️ TODAVÍA MALO" || echo "limpio ✓"
git log --oneline -1 | cut -c1-55
echo "── ¿telefonos.js está en disco y pm2 recargó? ──"
ls -la telefonos.js 2>/dev/null | awk '{print "  ",$5,"bytes",$6,$7,$8}'
timeout 20 pm2 jlist 2>/dev/null | python3 -c "
import json,sys,time
for p in json.load(sys.stdin):
    if p['name']!='maria-paez': continue
    print('  pm2', p['pm2_env']['status'], 'up=%dmin'%((time.time()*1000-p['pm2_env']['pm_uptime'])/60000))"
echo "── npm test completo ──"
timeout 120 env -u MARIA_DB -u MARIA_VAULT_KEY -u OWNER_NOMBRE -u OWNER_WA -u OWNER_EMAIL npm test 2>&1 | grep -E "^# (tests|pass|fail)|^not ok"
echo "── el módulo, en vivo ──"
timeout 25 node -e "
const tel=require('/root/secretaria/telefonos');
console.log('  Manuel c/9 == s/9 :', tel.mismoNumero('5491155771290','541155771290'));
console.log('  UY no colisiona   :', tel.mismoNumero('5491155771290','598155771290'));
console.log('  envío AR          :', tel.paraWa('54 11 5577 1290'));"
echo LISTO
