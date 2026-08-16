#!/bin/bash
cd /root/secretaria
[ -f state/.canary-bad-commit ] && { echo "CANARY BLOQUEÓ: $(cat state/.canary-bad-commit)"; exit 0; }
pm2 reload ecosystem.config.js --only maria-paez --update-env >/dev/null 2>&1 && echo "reload OK"
node -e "const wh=require('/root/secretaria/wa-hook.js'); console.log('require wa-hook OK')" 2>&1 | tail -1
echo LISTO
