#!/bin/bash
# 19/10 (aprobado Diego): daily-report → semanal (lunes 06:00, solo Maria+Sofia, sin funnel);
# weekly-review sigue generando el .md pero sin mail (un solo mail semanal). + 1er envío de prueba.
cd /root/secretaria
crontab -l > /root/crontab.bak-20261019
crontab -l | sed -E \
  -e 's#^0 6 \* \* \* (cd /root/secretaria && /usr/bin/node daily-report\.js)( >>)#0 6 * * 1 \1 --dias 7 --solo maria-paez,sofia-bruscoli --sin-funnel\2#' \
  -e 's#(node ops/scripts/weekly-review\.js)( >>)#\1 --no-mail\2#' | crontab -
echo "── crontab nuevo ──"; crontab -l | grep -n -E "daily-report|weekly-review"
echo "── envío de prueba ──"
timeout 200 /usr/bin/node daily-report.js --dias 7 --solo maria-paez,sofia-bruscoli --sin-funnel 2>&1 | grep -E "enviado|falló|Error" | tail -3
echo "── build MB ──"; tail -5 /root/mariabridge-build.log; cat /var/www/intensa.io/_dl/mariabridge-latest.json
