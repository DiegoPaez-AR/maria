#!/bin/bash
cd /root/secretaria
[ -f state/.canary-bad-commit ] && { echo "CANARY BLOQUEÓ: $(cat state/.canary-bad-commit)"; exit 0; }
pm2 reload ecosystem.config.js --only maria-paez --update-env >/dev/null 2>&1 && echo "reload OK"
for m in telegram-handler diferidos-drainer follow-ups cumple-avisos poda-eventos morning-brief; do node -e "require('/root/secretaria/$m.js')" 2>/dev/null && echo "  $m ✓" || echo "  $m ✗"; done
echo LISTO
