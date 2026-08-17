#!/bin/bash
echo "── cola del cron log (canary) ──"
grep -i "canary" /root/secretaria/ops/.cron.log | tail -6
echo "── require de wa-send con error completo ──"
cd /root/secretaria
env MARIA_DB=/tmp/x.sqlite GOOGLE_TOKEN_PATH=/tmp/t.json GOOGLE_CRED_PATH=/tmp/c.json node -e "require('./wa-send.js')" 2>&1 | head -12
echo LISTO
