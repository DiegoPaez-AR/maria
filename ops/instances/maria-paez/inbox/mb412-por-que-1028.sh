#!/bin/bash
# Solo lectura: por qué la 4.12 no se instala
cd /root/secretaria/logs
for s in maria-paez sofia-bruscoli; do echo "════ $s"; cat $s/out__2026-10-*.log $s/out.log 2>/dev/null | grep "\[MB " | grep -i "upd\|instal\|apk\|firma\|sign" | awk '$1>="2026-10-19"' | grep -v "al día" | head -20 | cut -c1-230; echo ...; cat $s/out.log | grep "\[MB " | grep -i "upd" | tail -4 | cut -c1-230; done
ls -la /var/www/intensa.io/_dl/ | grep -E "mb-354a0ea43ceecbc2|latest"; cat /var/www/intensa.io/_dl/mariabridge-latest.json
grep -i "error\|fail\|FALL" /root/mariabridge-build.log | tail -5
