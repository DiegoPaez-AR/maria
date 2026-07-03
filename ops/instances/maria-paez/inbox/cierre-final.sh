#!/bin/bash
cd /root/secretaria
grep -E "canary (OK|FALLÓ)" ops/.cron.log | tail -1
cat /root/secretaria/state/.canary-bad-commit 2>/dev/null || echo "(sin marker — OK)"
env -i PATH="$PATH" HOME=/root TZ=America/Argentina/Buenos_Aires npm test 2>&1 | grep -E "^# (tests|pass|fail)"
echo LISTO
