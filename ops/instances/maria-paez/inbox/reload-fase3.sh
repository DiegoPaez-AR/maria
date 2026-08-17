#!/bin/bash
cd /root/secretaria
[ -f state/.canary-bad-commit ] && { echo "CANARY BLOQUEÓ: $(cat state/.canary-bad-commit)"; exit 0; }
pm2 reload ecosystem.config.js --only maria-paez --update-env >/dev/null 2>&1 && echo "reload OK"
node -e "
const db=require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB,{readonly:true});
const cols=db.prepare('PRAGMA table_info(contactos)').all().map(c=>c.name);
console.log('contactos.telegram:', cols.includes('telegram') ? 'MIGRADO ✓' : 'FALTA ✗');
db.close();"
echo "── build v2.6 status ──"
grep "APK_OK\|APK_FAIL\|^e: file" /root/mariabridge-build.log | tail -2
curl -s https://intensa.io/_dl/mariabridge-latest.json; echo ""
echo LISTO
