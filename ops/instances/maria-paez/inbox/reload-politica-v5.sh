#!/bin/bash
cd /root/secretaria
[ -f state/.canary-bad-commit ] && { echo "CANARY BLOQUEÓ: $(cat state/.canary-bad-commit)"; exit 0; }
pm2 reload ecosystem.config.js --only maria-paez --update-env >/dev/null 2>&1 && echo "reload OK — política v5 activa"
node -e "
const {execSync}=require('child_process');
const e=JSON.parse(execSync('pm2 jlist').toString()).find(p=>p.name==='maria-paez').pm2_env;
console.log('WA_WARMUP:', e.WA_WARMUP, '| WA_SALIENTE_OFF:', e.WA_SALIENTE_OFF);
"
echo LISTO
