#!/bin/bash
# Switch atómico de single-instance (proceso pm2 'maria' + cron.sh) a
# multi-instance (proceso pm2 'maria-paez' + cron-master.sh).
#
# Orden:
#   1. Update crontab → cron-master.sh.
#      Próximo tick ejecuta cron-master que va a buscar proceso 'maria-paez'.
#      Si aún no existe, falla pero sin daño.
#   2. pm2 delete maria + pm2 start ecosystem.config.js.
#      Crea proceso 'maria-paez' con env del .conf.
#   3. pm2 save.
# 
# Después del switch, el cron viejo `cron.sh` queda como código pero NO se
# invoca más. Lo borro en un commit posterior.

set +e

cd /root/secretaria

echo "── ESTADO ACTUAL ──"
crontab -l 2>/dev/null | grep -E 'cron(\.sh|-master)'
pm2 list 2>&1 | grep -E '│ (maria|name)' | head -3
echo

echo "── PASO 1: crontab → cron-master.sh ──"
(crontab -l 2>/dev/null | grep -v 'ops/cron' ; echo '* * * * * cd /root/secretaria && bash ops/cron-master.sh >> /root/secretaria/ops/.cron.log 2>&1') | crontab -
echo "  nuevo crontab:"
crontab -l | grep cron
echo

echo "── PASO 2: pm2 delete maria + start ecosystem ──"
pm2 delete maria 2>&1 | tail -3
echo "  → starting from ecosystem.config.js"
pm2 start ecosystem.config.js 2>&1 | tail -10
echo

echo "── PASO 3: pm2 save ──"
pm2 save 2>&1 | tail -3
echo

echo "── ESTADO FINAL ──"
pm2 list 2>&1 | head -8
echo
sleep 5
echo "── pm2 logs maria-paez (últimas 30) ──"
pm2 logs maria-paez --lines 30 --nostream 2>&1 | tail -30
