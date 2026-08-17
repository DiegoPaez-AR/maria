#!/bin/bash
pgrep -f mb-build-worker >/dev/null && echo compilando || echo terminó
grep -E "BUILD (SUCC|FAIL)|APK_OK|APK_FAIL|^e: file" /root/mariabridge-build.log | tail -4
curl -s https://intensa.io/_dl/mariabridge-latest.json; echo ""
echo "── campaña: primeros envíos ──"
node -e "
const db=require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB,{readonly:true});
db.prepare(\"SELECT id,cuando,enviado FROM programados WHERE texto LIKE '%Telegram%' ORDER BY cuando LIMIT 3\").all().forEach(r=>console.log('#'+r.id,r.cuando.slice(11,16),'UTC',r.enviado?'ENVIADO ✓':'pendiente'));
db.close();"
echo LISTO
