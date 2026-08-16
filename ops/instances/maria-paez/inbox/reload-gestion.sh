#!/bin/bash
cd /root/secretaria
# esperar a que el canary del cron valide el commit nuevo (corre cada minuto)
sleep 5
if [ -f state/.canary-bad-commit ]; then echo "CANARY BLOQUEÓ: $(cat state/.canary-bad-commit)"; exit 0; fi
pm2 reload ecosystem.config.js --only maria-paez --update-env >/dev/null 2>&1 && echo "reload OK"
node -e "const ex=require('/root/secretaria/executor.js'); console.log('require executor OK');" 2>&1 | tail -1
