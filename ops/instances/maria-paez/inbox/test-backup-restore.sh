#!/bin/bash
cd /root/secretaria
pm2 reload ecosystem.config.js --only intensa-api --update-env >/dev/null 2>&1 && echo "intensa-api reload OK"
echo "── corriendo backup-weekly.sh completo (con restore-test) ──"
bash ops/scripts/backup-weekly.sh 2>&1 | grep -vE "^\s*$" | tail -25
