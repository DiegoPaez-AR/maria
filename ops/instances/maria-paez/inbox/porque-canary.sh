#!/bin/bash
cd /root/secretaria
grep -B 3 -A 12 "canary FALLO" ops/.cron.log | tail -25
echo LISTO
