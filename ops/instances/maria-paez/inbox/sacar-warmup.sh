#!/bin/bash
cd /root/secretaria
[ -f state/.canary-bad-commit ] && { echo "CANARY BLOQUEÓ: $(cat state/.canary-bad-commit)"; exit 0; }
CONF=config/instances/maria-paez.conf
sed -i 's/^WA_WARMUP=.*/WA_WARMUP=0/' "$CONF"
grep -E "^WA_(WARMUP|SALIENTE_OFF)=" "$CONF"
pm2 reload ecosystem.config.js --only maria-paez --update-env >/dev/null 2>&1 && echo "reload OK"
sleep 3
node -e "
const {execSync}=require('child_process');
const e=JSON.parse(execSync('pm2 jlist').toString()).find(p=>p.name==='maria-paez').pm2_env;
console.log('env efectivo → WA_WARMUP:', e.WA_WARMUP, '| WA_SALIENTE_OFF:', e.WA_SALIENTE_OFF);
"
echo "cold-send HABILITADO (tope 12 aperturas/hora sigue activo en la app)"
echo LISTO
