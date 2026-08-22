#!/bin/bash
cd /root/secretaria
echo "── canary (ojo: cron-master tiene lag de 1 tick) ──"
grep -i "canary" ops/.cron.log | tail -3
[ -f state/.canary-bad-commit ] && echo "⚠️ BLOQUEADO: $(cat state/.canary-bad-commit)" || echo "canary limpio ✓"
ls -la state/.ultimo-commit-bueno 2>/dev/null && echo "marcador de rollback: $(cat state/.ultimo-commit-bueno)" || echo "(marcador aún no creado — se crea en el próximo canary OK)"
echo "── tests ──"; npm test 2>&1 | grep -E "^# (pass|fail)" 
echo "── telegram vivo ──"; grep "TG" ~/.pm2/logs/maria-paez-out.log | tail -2
echo "── snapshots sin PII ──"; head -3 ops/instances/maria-paez/snapshots/hechos.txt 2>/dev/null
echo LISTO
