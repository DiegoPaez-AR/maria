#!/bin/bash
cd /root/secretaria
[ -f state/.canary-bad-commit ] && { echo "CANARY BLOQUEÓ: $(cat state/.canary-bad-commit)"; exit 0; }
node --check mb-verif.js && node --check internal-api.js && node --check wa-outbox.js && echo "syntax OK"
pm2 reload ecosystem.config.js --only maria-paez --update-env >/dev/null 2>&1 && echo "reload OK (mbverif + trabado)"
sleep 6
pm2 logs maria-paez --lines 30 --nostream 2>&1 | grep -iE "error|SyntaxError|Cannot find" | tail -5
if pgrep -f mb-build-worker >/dev/null; then echo "build corriendo"; else nohup bash /root/mb-build-worker.sh >/dev/null 2>&1 & echo "build v4.7 lanzado"; fi
