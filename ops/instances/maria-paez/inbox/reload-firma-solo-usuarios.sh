#!/bin/bash
cd /root/secretaria
[ -f state/.canary-bad-commit ] && { echo "CANARY BLOQUEÓ: $(cat state/.canary-bad-commit)"; exit 0; }
pm2 reload ecosystem.config.js --only maria-paez --update-env >/dev/null 2>&1 && echo "reload OK — firma TG solo a usuarios"
node -e "require('/root/secretaria/google.js'); console.log('require google OK')" 2>&1 | tail -1
echo LISTO
