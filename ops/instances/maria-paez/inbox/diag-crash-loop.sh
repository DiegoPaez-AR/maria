#!/bin/bash
echo "── error log (últimas 40) ──"
tail -40 /root/.pm2/logs/maria-paez-error.log
echo "── out log (últimas 15) ──"
tail -15 /root/.pm2/logs/maria-paez-out.log
echo "── canary ──"
grep -E "canary (OK|FALLÓ)" /root/secretaria/ops/.cron.log | tail -2
echo LISTO
