#!/bin/bash
cd /root/secretaria
echo "── canary ──"; grep -i "canary" ops/.cron.log | tail -2
[ -f state/.canary-bad-commit ] && echo "⚠️ BLOQUEADO: $(cat state/.canary-bad-commit)" || echo "canary limpio ✓"
echo "── npm test en el VPS ──"; npm test 2>&1 | tail -6
echo "── lease efectivo ──"; node -e "console.log('LEASE_S:', process.env.WA_OUTBOX_LEASE_S || '90 (default nuevo)')"
echo LISTO
