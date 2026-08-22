#!/bin/bash
grep -E "APK_OK|APK_FAIL|^e: file" /root/mariabridge-build.log | tail -2
curl -s https://intensa.io/_dl/mariabridge-latest.json; echo ""
grep "\[ctl\]" ~/.pm2/logs/maria-paez-out.log | tail -3
echo LISTO
