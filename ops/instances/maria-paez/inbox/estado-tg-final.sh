#!/bin/bash
cd /root/secretaria
grep -E "canary (OK|FALLÓ)" ops/.cron.log | tail -3
cat /root/secretaria/state/.canary-bad-commit 2>/dev/null || echo "(sin marker — OK)"
grep -E "arrancando telegram|\[TG\]" ~/.pm2/logs/maria-paez-out.log | tail -3
echo LISTO
