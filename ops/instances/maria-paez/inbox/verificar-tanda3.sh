#!/bin/bash
cd /root/secretaria
grep -i "canary" ops/.cron.log | tail -2
[ -f state/.canary-bad-commit ] && echo "⚠️ BLOQUEADO: $(cat state/.canary-bad-commit)" || echo "canary limpio ✓"
npm test 2>&1 | tail -4
echo "── build app ──"; grep -E "APK_OK|APK_FAIL|^e: file" /root/mariabridge-build.log | tail -2
curl -s https://intensa.io/_dl/mariabridge-latest.json; echo ""
echo LISTO
