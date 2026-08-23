#!/bin/bash
cd /root/secretaria
echo "marker: $(cat state/.canary-bad-commit 2>/dev/null)"
echo "HEAD  : $(git rev-parse HEAD)"
echo "ultimo bueno: $(cat state/.ultimo-commit-bueno 2>/dev/null)"
echo "--- ultimas fallas del canary ---"
grep -B 3 -A 12 "canary FALLO" ops/.cron.log | tail -30
echo LISTO
