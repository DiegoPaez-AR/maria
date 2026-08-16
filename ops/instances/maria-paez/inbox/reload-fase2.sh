#!/bin/bash
cd /root/secretaria
[ -f state/.canary-bad-commit ] && { echo "CANARY BLOQUEÓ: $(cat state/.canary-bad-commit)"; exit 0; }
pm2 reload ecosystem.config.js --update-env >/dev/null 2>&1 && echo "reload OK"
node -e "require('/root/secretaria/gmail-handler.js'); console.log('require gmail-handler OK')" 2>&1 | tail -1
echo LISTO
