#!/bin/bash
set -e
if ! crontab -l 2>/dev/null | grep -q gcontacts-reconcile; then
  (crontab -l 2>/dev/null; echo "0 4 * * 0 /root/secretaria/ops/scripts/gcontacts-reconcile.sh") | crontab -
  echo "crontab agregado (dom 04:00)"
else
  echo "crontab ya existía"
fi
crontab -l | grep gcontacts
bash /root/secretaria/ops/scripts/gcontacts-reconcile.sh &
echo "primera corrida lanzada en background (tarda ~5min, queda en gcontacts-reconcile.log)"
