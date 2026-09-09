#!/bin/bash
cd /root/secretaria
sleep 30   # que el tick termine de deployar ecosystem.config.js nuevo (ya está en disco: este script corre después del pull)
L=/root/secretaria/logs
mkdir -p $L/maria-paez $L/sofia-bruscoli $L/intensa-api $L/ops
echo "── 1. mover logs actuales (continuidad) ──"
for S in maria-paez sofia-bruscoli intensa-api; do
  [ -f /root/.pm2/logs/$S-out.log ]   && [ ! -f $L/$S/out.log ]   && mv /root/.pm2/logs/$S-out.log   $L/$S/out.log
  [ -f /root/.pm2/logs/$S-error.log ] && [ ! -f $L/$S/error.log ] && mv /root/.pm2/logs/$S-error.log $L/$S/error.log
done
[ -f ops/.daily-report.log ] && mv ops/.daily-report.log $L/ops/daily-report.log
for S in maria-paez sofia-bruscoli; do [ -f state/$S/gcontacts-reconcile.log ] && mv state/$S/gcontacts-reconcile.log $L/ops/gcontacts-reconcile-$S.log; done
du -sh $L/* | sed 's/^/  /'
echo "── 2. pm2 con rutas nuevas (delete+start: out_file no cambia con reload) ──"
timeout 60 pm2 delete maria-paez sofia-bruscoli intensa-api >/dev/null 2>&1
timeout 90 pm2 start ecosystem.config.js >/dev/null 2>&1 && echo "  start OK"
timeout 30 pm2 save >/dev/null 2>&1
sleep 8
pm2 jlist | python3 -c "import json,sys;[print(' ',p['name'],p['pm2_env']['status'],'→',p['pm2_env']['pm_out_log_path']) for p in json.load(sys.stdin)]"
echo "── 3. pm2-logrotate ──"
pm2 describe pm2-logrotate >/dev/null 2>&1 || timeout 150 pm2 install pm2-logrotate >/dev/null 2>&1
pm2 set pm2-logrotate:max_size 10M >/dev/null; pm2 set pm2-logrotate:retain 14 >/dev/null; pm2 set pm2-logrotate:compress true >/dev/null
pm2 set pm2-logrotate:dateFormat YYYY-MM-DD_HH-mm-ss >/dev/null; pm2 set pm2-logrotate:workerInterval 300 >/dev/null; pm2 set pm2-logrotate:rotateInterval '0 0 * * *' >/dev/null
pm2 describe pm2-logrotate 2>/dev/null | grep -E "status|version" | head -2 | sed 's/^/  /'
echo "── 4. crontab ──"
crontab -l > /tmp/cron.bak
sed -i 's|>> /root/secretaria/ops/.daily-report.log|>> /root/secretaria/logs/ops/daily-report.log|' /tmp/cron.bak
grep -q weekly-review /tmp/cron.bak || echo '0 5 * * 0 cd /root/secretaria && /usr/bin/node ops/scripts/weekly-review.js >> /root/secretaria/logs/ops/weekly-review.log 2>&1' >> /tmp/cron.bak
crontab /tmp/cron.bak && crontab -l | grep -E "daily-report|weekly-review|gcontacts" | sed 's/^/  /'
echo "── 5. primera revisión semanal (con mail) ──"
timeout 120 node ops/scripts/weekly-review.js 2>&1 | tail -6 | sed 's/^/  /'
ls ops/instances/*/reviews/ 2>/dev/null | sed 's/^/  /'
echo LISTO
